const form = document.getElementById('commandForm');
const commandSelect = document.getElementById('command');
const advancedOptions = document.getElementById('advancedOptions');
const logDiv = document.getElementById('log');
const totalConfigs = document.getElementById('totalConfigs');
const connectedConfigs = document.getElementById('connectedConfigs');
const operatorInput = document.getElementById('operator');
const ramUsage = document.getElementById('ramUsage');
const cpuUsage = document.getElementById('cpuUsage');
const cmdList = document.getElementById('cmdList');
const logSelect = document.getElementById('logSelect');
let runningCmds = {};
let logs = {};
let lastSelectedId = null;

// نمایش یا مخفی کردن گزینه‌های پیشرفته
commandSelect.addEventListener('change', () => {
  advancedOptions.style.display = commandSelect.value === 'advanced' ? '' : 'none';
});

// دریافت آمار اولیه با API
async function fetchStats() {
  let url = '/api/stats';
  const op = operatorInput.value.trim();
  if (op) url += `?operator=${encodeURIComponent(op)}`;
  const res = await fetch(url);
  if (res.ok) {
    const data = await res.json();
    totalConfigs.innerText = data.total;
    connectedConfigs.innerText = data.connected;
    if (data.ram) ramUsage.innerText = data.ram;
    if (data.cpu) cpuUsage.innerText = data.cpu;
  }
}
fetchStats();
operatorInput.addEventListener('change', fetchStats);
operatorInput.addEventListener('input', fetchStats);

function updateLogSelect() {
  // مقدار انتخاب‌شده فعلی را ذخیره کن
  const prev = logSelect.value;
  const ids = Object.keys(logs);
  logSelect.innerHTML = '';
  ids.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.text = logs[id].title || id;
    logSelect.appendChild(opt);
  });
  // اگر قبلاً انتخاب شده بود، همان را نگه دار
  if (prev && ids.includes(prev)) logSelect.value = prev;
  else if (ids.length) logSelect.value = ids[ids.length-1];
  showSelectedLog();
}

function showSelectedLog() {
  const id = logSelect.value;
  lastSelectedId = id;
  logDiv.innerText = logs[id]?.text || '';
}

logSelect.addEventListener('change', showSelectedLog);

// --- LocalStorage: ذخیره و بازیابی لاگ‌ها ---
function saveLogsToStorage() {
  try {
    localStorage.setItem('logs', JSON.stringify(logs));
  } catch {}
}
function loadLogsFromStorage() {
  try {
    const data = localStorage.getItem('logs');
    if (data) logs = JSON.parse(data);
  } catch {}
}
loadLogsFromStorage();
updateLogSelect();

function addLog(id, type, data, title) {
  if (!logs[id]) logs[id] = { text: '', title };
  // حذف escape sequenceهای رنگ ترمینال و \r
  let cleanData = (data || '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
  if (type === 'log' || type === 'error') logs[id].text += cleanData;
  if (type === 'done') logs[id].text += `\n--- عملیات تمام شد (کد خروج: ${data}) ---\n`;
  if (logs[id].text.length > 5000) logs[id].text = logs[id].text.slice(-5000); // فقط آخرین ۵۰۰۰ کاراکتر
  if (title) logs[id].title = title;
  saveLogsToStorage();
  updateLogSelect();
  if (logSelect.value === id) showSelectedLog();
}

// WebSocket اتصال
const ws = new WebSocket(`ws://${location.host}`);
ws.onmessage = (event) => {
  let msg;
  try { msg = JSON.parse(event.data); } catch { msg = { type: 'log', data: event.data }; }
  if (msg.type === 'log' || msg.type === 'error' || msg.type === 'done') {
    addLog(msg.id, msg.type, msg.data || msg.code, runningCmds[msg.id]?.args?.join(' '));
  }
  if (msg.type === 'stats') {
    totalConfigs.innerText = msg.total;
    connectedConfigs.innerText = msg.connected;
    if (msg.ram) ramUsage.innerText = msg.ram;
    if (msg.cpu) cpuUsage.innerText = msg.cpu;
  }
  if (msg.type === 'cmdList') {
    renderCmdList(msg.cmds);
    // عنوان هر لاگ را با آرگومان‌های دستور به‌روزرسانی کن
    Object.entries(msg.cmds).forEach(([id, cmd]) => {
      if (logs[id]) logs[id].title = cmd.args.join(' ');
    });
    updateLogSelect();
  }
  logDiv.scrollTop = logDiv.scrollHeight;
};

function renderCmdList(cmds) {
  cmdList.innerHTML = '';
  Object.entries(cmds).forEach(([id, cmd]) => {
    const li = document.createElement('li');
    li.className = 'cmd-item';
    li.innerHTML = `<span>${cmd.args.join(' ')}</span><button onclick="window.stopCmd('${id}')">توقف</button>`;
    cmdList.appendChild(li);
  });
}
window.stopCmd = function(id) {
  fetch('/api/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  logDiv.innerText = '';
  const command = commandSelect.value;
  let options = {};
  let operator = operatorInput.value.trim();
  // منطق ویژه برای prod-advanced
  if (command === 'prod-advanced') {
    operator = 'production';
    options = { days: 3, tests: 10 };
  } else if (command === 'import') {
    const filePath = document.getElementById('importFilePath').value;
    if (filePath) options.filePath = filePath;
  }
  const res = await fetch('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: command === 'prod-advanced' ? 'advanced' : command, options, operator })
  });
  if (res.ok) {
    const { id } = await res.json();
    logs[id] = { text: '', title: `${command} ${operator}` };
    saveLogsToStorage();
    updateLogSelect();
    logSelect.value = id;
    showSelectedLog();
  }
});

// مدیریت و ویرایش activeConfig
const activeConfigForm = document.getElementById('activeConfigForm');
const activeConfigContent = document.getElementById('activeConfigContent');
const activeConfigMsg = document.getElementById('activeConfigMsg');
const loadActiveConfigBtn = document.getElementById('loadActiveConfig');

loadActiveConfigBtn.onclick = async function() {
  activeConfigMsg.innerText = '';
  try {
    const res = await fetch('/api/active-config');
    const data = await res.json();
    if (res.ok) {
      activeConfigContent.value = data.content;
      activeConfigMsg.innerText = 'مقدار فعلی بارگذاری شد.';
    } else {
      activeConfigMsg.innerText = data.error || 'خطا در دریافت مقدار.';
    }
  } catch (e) {
    activeConfigMsg.innerText = 'خطا در ارتباط با سرور.';
  }
};

activeConfigForm.onsubmit = async function(e) {
  e.preventDefault();
  activeConfigMsg.innerText = '';
  const content = activeConfigContent.value;
  try {
    const res = await fetch('/api/active-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (res.ok) {
      activeConfigMsg.innerText = 'ذخیره شد.';
    } else {
      activeConfigMsg.innerText = data.error || 'خطا در ذخیره مقدار.';
    }
  } catch (e) {
    activeConfigMsg.innerText = 'خطا در ارتباط با سرور.';
  }
};

// مدیریت و ویرایش subs.json
const subsConfigForm = document.getElementById('subsConfigForm');
const subsConfigContent = document.getElementById('subsConfigContent');
const subsConfigMsg = document.getElementById('subsConfigMsg');
const loadSubsConfigBtn = document.getElementById('loadSubsConfig');

loadSubsConfigBtn.onclick = async function() {
  subsConfigMsg.innerText = '';
  try {
    const res = await fetch('/api/subs');
    const data = await res.json();
    if (res.ok) {
      subsConfigContent.value = data.content;
      subsConfigMsg.innerText = 'مقدار فعلی بارگذاری شد.';
    } else {
      subsConfigMsg.innerText = data.error || 'خطا در دریافت مقدار.';
    }
  } catch (e) {
    subsConfigMsg.innerText = 'خطا در ارتباط با سرور.';
  }
};

subsConfigForm.onsubmit = async function(e) {
  e.preventDefault();
  subsConfigMsg.innerText = '';
  const content = subsConfigContent.value;
  try {
    const res = await fetch('/api/subs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (res.ok) {
      subsConfigMsg.innerText = 'ذخیره شد.';
    } else {
      subsConfigMsg.innerText = data.error || 'خطا در ذخیره مقدار.';
    }
  } catch (e) {
    subsConfigMsg.innerText = 'خطا در ارتباط با سرور.';
  }
};

// مدیریت و ویرایش subsb64.json
const subsb64ConfigForm = document.getElementById('subsb64ConfigForm');
const subsb64ConfigContent = document.getElementById('subsb64ConfigContent');
const subsb64ConfigMsg = document.getElementById('subsb64ConfigMsg');
const loadSubsb64ConfigBtn = document.getElementById('loadSubsb64Config');

loadSubsb64ConfigBtn.onclick = async function() {
  subsb64ConfigMsg.innerText = '';
  try {
    const res = await fetch('/api/subsb64');
    const data = await res.json();
    if (res.ok) {
      subsb64ConfigContent.value = data.content;
      subsb64ConfigMsg.innerText = 'مقدار فعلی بارگذاری شد.';
    } else {
      subsb64ConfigMsg.innerText = data.error || 'خطا در دریافت مقدار.';
    }
  } catch (e) {
    subsb64ConfigMsg.innerText = 'خطا در ارتباط با سرور.';
  }
};

subsb64ConfigForm.onsubmit = async function(e) {
  e.preventDefault();
  subsb64ConfigMsg.innerText = '';
  const content = subsb64ConfigContent.value;
  try {
    const res = await fetch('/api/subsb64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (res.ok) {
      subsb64ConfigMsg.innerText = 'ذخیره شد.';
    } else {
      subsb64ConfigMsg.innerText = data.error || 'خطا در ذخیره مقدار.';
    }
  } catch (e) {
    subsb64ConfigMsg.innerText = 'خطا در ارتباط با سرور.';
  }
};
// --- Cleanup Panel Logic ---
const cleanupStatsBox = document.getElementById('cleanupStatsBox');
const cleanupStats = document.getElementById('cleanupStats');
const runSimpleCleanupBtn = document.getElementById('runSimpleCleanup');
const advancedCleanupBox = document.getElementById('advancedCleanupBox');
const advancedCleanupForm = document.getElementById('advancedCleanupForm');
const advDays = document.getElementById('advDays');
const advTests = document.getElementById('advTests');
const advDryRun = document.getElementById('advDryRun');
const advMoveConnected = document.getElementById('advMoveConnected');
const cleanupTrashBox = document.getElementById('cleanupTrashBox');
const trashTable = document.getElementById('trashTable').querySelector('tbody');
const restoreSelectedBtn = document.getElementById('restoreSelected');
const deleteSelectedBtn = document.getElementById('deleteSelected');
const cleanupMsg = document.getElementById('cleanupMsg');

let trashList = [];
let selectedTrash = new Set();

function showCleanupMsg(msg, color='#1976d2') {
  cleanupMsg.innerText = msg;
  cleanupMsg.style.color = color;
}

async function loadCleanupStats() {
  showCleanupMsg('در حال دریافت...');
  // آمار
  const statsRes = await fetch('/api/cleanup/stats');
  const stats = await statsRes.json();
  if (!statsRes.ok) return showCleanupMsg(stats.error || 'خطا در دریافت آمار', 'red');
  cleanupStatsBox.style.display = '';
  advancedCleanupBox.style.display = '';
  cleanupTrashBox.style.display = '';
  cleanupStats.innerText = `کل: ${stats.total} | متصل: ${stats.connected} | ناموفق: ${stats.failed} | سطل زباله: ${stats.trash} | قدیمی: ${stats.old} | تست زیاد: ${stats.overTested}`;
  // لیست trash
  const trashRes = await fetch('/api/cleanup/trash');
  const trashData = await trashRes.json();
  if (!trashRes.ok) return showCleanupMsg(trashData.error || 'خطا در دریافت لیست trash', 'red');
  trashList = trashData.trash;
  renderTrashTable();
  showCleanupMsg('');
}
window.addEventListener('DOMContentLoaded', loadCleanupStats);

function renderTrashTable() {
  trashTable.innerHTML = '';
  selectedTrash = new Set();
  trashList.forEach((item, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type='checkbox' data-i='${i}' class='trashCheck'> ${item.uri?.slice(0,60) || ''}</td><td>${item.type || ''}</td><td>${item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</td><td><button class='restoreBtn' data-i='${i}'>بازگردانی</button> <button class='deleteBtn' data-i='${i}' style='background:#e53935;'>حذف</button></td>`;
    trashTable.appendChild(tr);
  });
  // انتخاب گروهی
  trashTable.querySelectorAll('.trashCheck').forEach(chk => {
    chk.onchange = function() {
      const idx = Number(this.getAttribute('data-i'));
      if (this.checked) selectedTrash.add(trashList[idx]._id);
      else selectedTrash.delete(trashList[idx]._id);
    };
  });
  // دکمه‌های بازگردانی/حذف تکی
  trashTable.querySelectorAll('.restoreBtn').forEach(btn => {
    btn.onclick = () => restoreTrash([trashList[btn.getAttribute('data-i')]._id]);
  });
  trashTable.querySelectorAll('.deleteBtn').forEach(btn => {
    btn.onclick = () => deleteTrash([trashList[btn.getAttribute('data-i')]._id]);
  });
}

runSimpleCleanupBtn.onclick = async function() {
  showCleanupMsg('در حال پاک‌سازی...');
  const res = await fetch('/api/cleanup/move-old', { method:'POST' });
  const data = await res.json();
  if (res.ok) showCleanupMsg(data.message, 'green');
  else showCleanupMsg(data.error || 'خطا در پاک‌سازی', 'red');
  loadCleanupStats();
};

advancedCleanupForm.onsubmit = async function(e) {
  e.preventDefault();
  showCleanupMsg('در حال پاک‌سازی پیشرفته...');
  const body = {
    daysOld: Number(advDays.value),
    maxTests: Number(advTests.value),
    dryRun: advDryRun.checked,
    moveConnected: advMoveConnected.checked
  };
  const res = await fetch('/api/cleanup/advanced', {
    method:'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (res.ok) showCleanupMsg(data.message, 'green');
  else showCleanupMsg(data.error || 'خطا در پاک‌سازی پیشرفته', 'red');
  loadCleanupStats();
};

restoreSelectedBtn.onclick = () => restoreTrash(Array.from(selectedTrash));
deleteSelectedBtn.onclick = () => deleteTrash(Array.from(selectedTrash));

async function restoreTrash(ids) {
  if (!ids.length) return showCleanupMsg('هیچ موردی انتخاب نشده', 'red');
  showCleanupMsg('در حال بازگردانی...');
  const res = await fetch('/api/cleanup/restore', {
    method:'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ ids })
  });
  const data = await res.json();
  if (res.ok) showCleanupMsg(data.message, 'green');
  else showCleanupMsg(data.error || 'خطا در بازگردانی', 'red');
  loadCleanupStats();
}

async function deleteTrash(ids) {
  if (!ids.length) return showCleanupMsg('هیچ موردی انتخاب نشده', 'red');
  showCleanupMsg('در حال حذف...');
  const res = await fetch('/api/cleanup/delete', {
    method:'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ ids })
  });
  const data = await res.json();
  if (res.ok) showCleanupMsg(data.message, 'green');
  else showCleanupMsg(data.error || 'خطا در حذف', 'red');
  loadCleanupStats();
}

// دکمه بازگردانی همه
const restoreAllBtn = document.createElement('button');
restoreAllBtn.id = 'restoreAllBtn';
restoreAllBtn.innerText = 'بازگردانی همه کانفیگ 0های سطل زباله';
restoreAllBtn.style.marginTop = '8px';
restoreAllBtn.onclick = async function() {
  showCleanupMsg('در حال بازگردانی همه...');
  const res = await fetch('/api/cleanup/restore-all', { method:'POST' });
  const data = await res.json();
  if (res.ok) showCleanupMsg(data.message, 'green');
  else showCleanupMsg(data.error || 'خطا در بازگردانی همه', 'red');
  loadCleanupStats();
};
window.addEventListener('DOMContentLoaded', () => {
  const cleanupTrashBox = document.getElementById('cleanupTrashBox');
  if (cleanupTrashBox && !document.getElementById('restoreAllBtn')) {
    cleanupTrashBox.appendChild(restoreAllBtn);
  }
});
// دکمه پاک کردن همه لاگ‌ها
const clearLogsBtn = document.createElement('button');
clearLogsBtn.id = 'clearLogsBtn';
clearLogsBtn.innerText = 'پاک کردن همه لاگ‌ها';
clearLogsBtn.style.margin = '8px 0 0 8px';
clearLogsBtn.onclick = function() {
  logs = {};
  saveLogsToStorage();
  updateLogSelect();
  logDiv.innerText = '';
};
window.addEventListener('DOMContentLoaded', () => {
  const logSelectParent = logSelect.parentElement;
  if (logSelectParent && !document.getElementById('clearLogsBtn')) {
    logSelectParent.appendChild(clearLogsBtn);
  }
}); 
// Express & WebSocket server for admin panel
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const {spawn} = require('child_process');
const mongoose = require('mongoose');
const {ProxyModel} = require('../DB/ProxyModel');
const os = require('os');
let runningCmds = {};
require('dotenv').config();
const fs = require('fs');

function getSysInfo() {
    const mem = process.memoryUsage();
    const ram = (mem.rss / 1024 / 1024).toFixed(1) + ' MB';
    const cpu = os.loadavg()[0].toFixed(2);
    return {ram, cpu};
}

function buildMongoUri(baseUri, dbName) {
    const uriParts = baseUri.split('/');
    const lastPart = uriParts[uriParts.length - 1];
    if (lastPart && !lastPart.includes(':') && !lastPart.includes('@') && lastPart !== '' && lastPart.indexOf('?') === -1) {
        return baseUri;
    } else {
        return baseUri.replace(/\/$/, '') + '/' + dbName;
    }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({server});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store all connected clients
let clients = [];
wss.on('connection', (ws) => {
    clients.push(ws);
    ws.on('close', () => {
        clients = clients.filter(c => c !== ws);
    });
});

// Helper: broadcast to all clients
function broadcast(data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
}

const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';

const STATS_INTERVAL = parseInt(process.env.STATS_INTERVAL || '5000', 10);
const TEST_CONCURRENCY = parseInt(process.env.TEST_CONCURRENCY || '100', 10); // تعداد کانفیگ همزمان برای تست

// اتصال به دیتابیس فقط یک بار در ابتدای برنامه
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected');
        const PORT = process.env.PORT || 3001;
        server.listen(PORT, () => {
            console.log(`Admin panel server running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// API: آمار زنده کانفیگ‌ها + سیستم
app.get('/api/stats', async (req, res) => {
    try {
        const total = await ProxyModel.countDocuments({});
        const connected = await ProxyModel.countDocuments({isConnected: true});
        const sys = getSysInfo();
        res.json({total, connected, ...sys});
    } catch (e) {
        res.status(500).json({error: e.message});
    }
});

app.get('/prx/http', async function (req, res) {
    const proxies = await ProxyModel.find({
        isConnected: true,
        type: 'http'
    });
    let r = '';
    for (const proxy of proxies) {
        r += `${proxy.ip}:${proxy.port}\n`
    }
    res.send(r);
});

app.get('/prx/https', async function (req, res) {
    const proxies = await ProxyModel.find({
        isConnected: true,
        type: 'https'
    });
    let r = '';
    for (const proxy of proxies) {
        r += `${proxy.ip}:${proxy.port}\n`
    }
    res.send(r);
});

app.get('/prx/socks4', async function (req, res) {
    const proxies = await ProxyModel.find({
        isConnected: true,
        type: 'socks4'
    });
    let r = '';
    for (const proxy of proxies) {
        r += `${proxy.ip}:${proxy.port}\n`
    }
    res.send(r);
});
app.get('/prx/socks5', async function (req, res) {
    const proxies = await ProxyModel.find({
        isConnected: true,
        type: 'socks4'
    });
    let r = '';
    for (const proxy of proxies) {
        r += `${proxy.ip}:${proxy.port}\n`
    }
    res.send(r);
});

// WebSocket: ارسال آمار و لیست دستورات و سیستم هر 5 ثانیه
setInterval(async () => {
    try {
        const total = await ProxyModel.countDocuments({trash: {$ne: true}});
        const connected = await ProxyModel.countDocuments({isConnected: true, trash: {$ne: true}});
        const sys = getSysInfo();
        broadcast({type: 'stats', total, connected, ...sys});
        broadcast({type: 'cmdList', cmds: runningCmds});
    } catch {
    }
}, STATS_INTERVAL);

// API: اجرای دستورات با اپراتور (چندتایی)
const {randomUUID} = require('crypto');
const {logger} = require("../utils/logger");
app.post('/api/command', (req, res) => {
    const body = req.body || {};
    const {command, options, operator} = body;
    if (!command) {
        return res.status(400).json({error: 'دستور ارسال نشده است.'});
    }
    const allowed = [
        'add', 'test', 'createfile', 'testConnected', 'telegram', 'testOLD', 'testAll', 'disconnect', 'export', 'import', 'advanced', 'location'
    ];
    if (!allowed.includes(command)) {
        return res.status(400).json({error: 'دستور مجاز نیست.'});
    }
    let args = ['index.js', command];
    if (operator) args.push(operator);
    if (command === 'import' && options?.filePath) {
        args.push(options.filePath);
    }
    // اگر دستور test بود، تعداد کانفیگ همزمان را هم اضافه کن
    if (command === 'test' && TEST_CONCURRENCY) {
        args.push(TEST_CONCURRENCY.toString());
    }
    const id = randomUUID();
    const proc = spawn('node', args, {cwd: path.resolve(__dirname, '..')});
    runningCmds[id] = {args, pid: proc.pid};
    proc.stdout.on('data', (data) => {
        broadcast({type: 'log', id, data: data.toString()});
    });
    proc.stderr.on('data', (data) => {
        broadcast({type: 'error', id, data: data.toString()});
    });
    proc.on('close', (code) => {
        broadcast({type: 'done', id, code});
        delete runningCmds[id];
        broadcast({type: 'cmdList', cmds: runningCmds});
    });
    broadcast({type: 'cmdList', cmds: runningCmds});
    res.json({status: 'started', id});
});

// API: توقف دستور
app.post('/api/stop', (req, res) => {
    const {id} = req.body;
    const cmd = runningCmds[id];
    if (cmd) {
        try {
            process.kill(cmd.pid);
            delete runningCmds[id];
            broadcast({type: 'cmdList', cmds: runningCmds});
            res.json({status: 'stopped'});
        } catch (e) {
            res.status(500).json({error: e.message});
        }
    } else {
        res.status(404).json({error: 'دستور پیدا نشد.'});
    }
});

const ACTIVE_CONFIG_PATH = path.resolve(__dirname, '../activeConfig');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

// API: دریافت مقدار activeConfig
app.get('/api/active-config', (req, res) => {
    try {
        const content = fs.readFileSync(ACTIVE_CONFIG_PATH, 'utf8');
        res.json({content});
    } catch (e) {
        res.status(500).json({error: e.message});
    }
});

// API: ویرایش مقدار activeConfig
app.post('/api/active-config', (req, res) => {
    const {content} = req.body;
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({error: 'مقدار نامعتبر'});
    try {
        fs.writeFileSync(ACTIVE_CONFIG_PATH, content.trim());
        res.json({status: 'ok'});
    } catch (e) {
        res.status(500).json({error: e.message});
    }
});

const SUBS_PATH = path.resolve(__dirname, '../subs.json');
const SUBSB64_PATH = path.resolve(__dirname, '../subsb64.json');

// API: دریافت مقدار subs.json
app.get('/api/subs', (req, res) => {
    try {
        const content = fs.readFileSync(SUBS_PATH, 'utf8');
        res.json({content});
    } catch (e) {
        res.status(500).json({error: e.message});
    }
});

// API: ویرایش مقدار subs.json
app.post('/api/subs', (req, res) => {
    const {content} = req.body;
    try {
        // Validate JSON array
        const arr = JSON.parse(content);
        if (!Array.isArray(arr)) throw new Error('فرمت باید آرایه باشد');
        fs.writeFileSync(SUBS_PATH, JSON.stringify(arr, null, 2));
        res.json({status: 'ok'});
    } catch (e) {
        res.status(400).json({error: e.message});
    }
});

// API: دریافت مقدار subsb64.json
app.get('/api/subsb64', (req, res) => {
    try {
        const content = fs.readFileSync(SUBSB64_PATH, 'utf8');
        res.json({content});
    } catch (e) {
        res.status(500).json({error: e.message});
    }
});

// API: ویرایش مقدار subsb64.json
app.post('/api/subsb64', (req, res) => {
    const {content} = req.body;
    try {
        // Validate JSON array
        const arr = JSON.parse(content);
        if (!Array.isArray(arr)) throw new Error('فرمت باید آرایه باشد');
        fs.writeFileSync(SUBSB64_PATH, JSON.stringify(arr, null, 2));
        res.json({status: 'ok'});
    } catch (e) {
        res.status(400).json({error: e.message});
    }
});

// آمار کامل کلین‌آپ

// لیست کانفیگ‌های trash


// انتقال خودکار به trash






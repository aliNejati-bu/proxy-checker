const axios = require("axios");
const {HttpsProxyAgent} = require("https-proxy-agent");
const {SocksProxyAgent} = require("socks-proxy-agent");
const {logger} = require("./utils/logger");
const {ProxyModel} = require("./DB/ProxyModel");
const {HttpProxyAgent} = require("http-proxy-agent");
const testUrl = "https://t.me";

/**
 * تست اتصال به یک پروکسی مشخص
 * @param {string} type - نوع پروکسی (http, https, socks4, socks5)
 * @param {string} ip - آدرس IP پروکسی
 * @param {number} port - پورت پروکسی
 */
async function testProxy(type, ip, port) {
    const proxyUrl = `${type}://${ip}:${port}`;
    let agent;

    try {
        if (type.startsWith("socks")) {
            agent = new SocksProxyAgent(proxyUrl);
        } else if (type === "http") {
            agent = new HttpProxyAgent(proxyUrl); // ✅ درست برای پراکسی HTTP
        } else if (type === "https") {
            agent = new HttpsProxyAgent({
                host: ip,
                port: port,
                protocol: "https:",
                rejectUnauthorized: false, // غیرفعال کردن چک SSL
            });
        }

        // استفاده از Promise.race برای اطمینان از قطع شدن بعد از ۹ ثانیه
        await Promise.race([
            axios.get(testUrl, {
                httpsAgent: agent,
                httpAgent: agent,
                timeout: 30000,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Global timeout")), 30000))
        ]);

        logger(`[✅] ${type.toUpperCase()} ${ip}:${port} is working.`);
        return true;
    } catch (err) {
        //logger(`[❌] ${type.toUpperCase()} ${ip}:${port} failed: ${err.message}`);
        return false;
    }
}

async function prepareSrc(url) {
    try {
        logger("Prepare Url", url.url)
        const result = await axios.get(url.url);
        const data = result.data.split("\n");
        const urls = [];
        data.forEach((item) => {
            item = item.replace("http://", '');
            item = item.replace("https://", '');
            item = item.trim();
            if (item.startsWith("#")) return;
            if (url.type == "0") {
                const match = item.match(/\(([^)]+)\)(.+)/);
                if (match) {
                    const protocol = match[1].toLowerCase();
                    const address = match[2];
                    urls.push(`${protocol}://${address}`);
                }
            } else {
                urls.push(`${url.type}://${item}`);
            }
        });
        return urls;
    } catch (e) {
        logger(url.url, "Error:", e.message);
        return [];
    }
}


/**
 * ذخیره پراکسی در دیتابیس
 * @param {string} proxyAddress - مثل "socks4://16.51.42.19:3128"
 */
async function saveProxyToDB(proxyAddress) {
    try {
        const url = new URL(proxyAddress);
        const type = url.protocol.replace(':', ''); // socks4
        const ip = url.hostname; // 16.51.42.19
        const port = url.port; // 3128

        const newProxy = new ProxyModel({
            type,
            ip,
            port,
            uniqueValue: proxyAddress,
        });

        await newProxy.save();
        //logger(`✅ َAdded: ${proxyAddress}`);
        return true;
    } catch (err) {
        return false;
    }
}


function getConfigsToTest(limit = 100) {
    const sortEnv = process.env.IS_NEW;
    let newVal = 1;
    if (sortEnv == 'true') {
        newVal = -1;
    }
    console.log({
        tries: 1,        // اولویت با tries کمتر
        createdAt: newVal     // در صورت برابر بودن، اولویت با قدیمی‌ترها
    })
    return ProxyModel.find({
        isConnected: false,
    })
        .sort({
            tries: 1,        // اولویت با tries کمتر
            createdAt: newVal     // در صورت برابر بودن، اولویت با قدیمی‌ترها
        })
        .limit(limit);
}


module.exports.prepareSrc = prepareSrc;
module.exports.testProxy = testProxy;
module.exports.saveProxyToDB = saveProxyToDB;
module.exports.getConfigsToTest = getConfigsToTest;
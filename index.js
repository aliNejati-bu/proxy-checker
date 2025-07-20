const mongoose = require("mongoose");
const {logger} = require("./utils/logger");
const {prepareSrc, saveProxyToDB, testProxy, getConfigsToTest} = require("./ProxyLogic");
const cliProgress = require("cli-progress");
const {ProxyModel} = require("./DB/ProxyModel");
require('dotenv').config();

/*let data = require("./temp.json");
let pr = require("./src.json");
const fs = require("node:fs");
data.forEach((item) => {
    pr.push({
        url: item,
        type: "socks5"
    });
});
fs.writeFileSync("./src.json", JSON.stringify(pr));*/
process.on("uncaughtException", (err) => {
    //console.error("Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason.message || reason);
});
mongoose.connect(process.env.MONGO_URI).then(async () => {
    logger(`Connected to MongoDB.`);

    if (process.argv[2] === "add") {
        const urls = require("./src.json");
        for (const url of urls) {
            const urlsArray = await prepareSrc(url);
            let successCount = 0;
            let duplicateCount = 0;

            console.log(`\n📥 Adding proxies from: ${url}`);

            // Initialize progress bar
            const bar = new cliProgress.SingleBar({
                format: 'Progress |{bar}| {percentage}% | {value}/{total} | Success: {success} | Duplicates: {duplicate}',
                barCompleteChar: '\u2588',
                barIncompleteChar: '\u2591',
                hideCursor: true,
            });

            bar.start(urlsArray.length, 0, {
                success: successCount,
                duplicate: duplicateCount,
            });

            for (const proxy of urlsArray) {
                const saved = await saveProxyToDB(proxy);
                if (saved) successCount++;
                else duplicateCount++;

                bar.increment(1, {
                    success: successCount,
                    duplicate: duplicateCount,
                });
            }

            bar.stop();
            console.log(`✅ Done: ${successCount} added, ⚠️ ${duplicateCount} duplicates.\n`);
        }
    }
    if (process.argv[2] === "testAll") {
        while (true) {

            const proxies = await getConfigsToTest(500);
            await testProxies(proxies);
        }
    }
    if (process.argv[2] === "disconnect") {
        await ProxyModel.updateMany({}, {
            $set: {
                tries: 0,
                isConnected: false
            }
        })
    }

    if (process.argv[2] === "tries") {
        const count = await ProxyModel.countDocuments({
            tries: process.argv[3],
        });
        logger(count);
    }
});


/**
 * برسی کانفیگ های موجود
 * @param proxies
 * @returns {Promise<Awaited<unknown>[]>}
 */
async function testProxies(proxies) {
    logger("Start Testing...");
    return Promise.all(proxies.map(async (proxy) => {
        try {
            if (proxy.tries < -1) {
                proxy.tries = -1;
            }
            // تست کانفیگ
            //let st = Date.now();
            const testResult = await testProxy(proxy.type, proxy.ip, proxy.port);
            //logger(Date.now() - st);

            // اگر کانفیگ متصل شد، connectionStatus را true می‌کنیم و lastModifiedAt را آپدیت می‌کنیم
            if (testResult) {
                logger("success");
                await ProxyModel.findByIdAndUpdate(proxy._id, {
                    $set: {
                        isConnected: true,
                        lastUpdatedAt: new Date(),
                        tries: proxy.tries - 1,
                    },
                    $push: {
                        history: {
                            status: true
                        }
                    }
                });
            } else {
                // اگر متصل نشد، فقط تاریخ آخرین تغییرات را آپدیت می‌کنیم
                await ProxyModel.findByIdAndUpdate(proxy._id, {
                    $set: {
                        lastUpdatedAt: new Date(),
                        tries: proxy.tries + 1,
                    },
                    $push: {
                        history: {
                            status: false
                        }
                    }
                });
            }

            return {success: testResult.success, uri: proxy.uri, status: testResult.status};
        } catch (error) {
            // در صورتی که خطا داشته باشیم، کانفیگ را به روز رسانی میکنیم و خطا را ذخیره میکنیم
            await ProxyModel.findByIdAndUpdate(proxy._id, {
                $set: {
                    lastUpdatedAt: new Date(),
                    tries: proxy.tries + 1,
                },
                $push: {
                    history: {
                        status: false
                    }
                }
            });

            return {success: false, uri: proxy.uri, error: error.message};
        }
    }));
}



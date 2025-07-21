const {request} = require('undici');
const {CookieJar} = require('tough-cookie');
const {ProxyAgent} = require('proxy-agent');
const mongoose = require("mongoose");
const {ProxyModel} = require("./DB/ProxyModel");
const {HttpProxyAgent} = require("http-proxy-agent");
const {HttpsProxyAgent} = require("https-proxy-agent");
const {SocksProxyAgent} = require("socks-proxy-agent");
const got = require('got');

class Api {
    static real_views = 0;
    static proxy_errors = 0;
    static token_errors = 0;

    constructor(channel, post) {
        this.url = 'https://t.me/';
        this.channel = channel;
        this.post = post;
    }

    getAgent(proxy, proxyType) {
        const proxyUrl = `${proxyType.toLowerCase()}://${proxy}`;
        switch (proxyType.toLowerCase()) {
            case 'http':
                return new HttpProxyAgent(proxyUrl);
            case 'https':
                const httpsAgent = new HttpsProxyAgent(proxyUrl);
                httpsAgent.options.rejectUnauthorized = false;
                return httpsAgent;
            case 'socks4':
                return new SocksProxyAgent(`socks4://${proxy}`);
            case 'socks5':
                return new SocksProxyAgent(`socks5://${proxy}`);
            default:
                return null;
        }
    }

    async sendView(proxy, proxyType) {
        const agent = this.getAgent(proxy, proxyType);
        const jar = new CookieJar();

        try {
            const postUrl = `${this.url}${this.channel}/${this.post}`;
            const embedUrl = `${postUrl}?embed=1&mode=tme`;

            // Step 1: Get view token
            const res1 = await got(embedUrl, {
                agent: {http: agent, https: agent},
                cookieJar: jar,
                headers: {
                    'referer': postUrl,
                    'user-agent': 'Mozilla/5.0'
                },
                timeout: {request: 15000},
                https: {rejectUnauthorized: false}
            });

            const match = res1.body.match(/data-view="([^"]+)"/);
            if (!match) {
                Api.token_errors++;
                return;
            }

            const viewToken = match[1];

            // Step 2: Send "view" request
            await got('https://t.me/v/', {
                searchParams: {views: viewToken},
                agent: {http: agent, https: agent},
                cookieJar: jar,
                headers: {
                    'referer': embedUrl,
                    'user-agent': 'Mozilla/5.0',
                    'x-requested-with': 'XMLHttpRequest'
                },
                timeout: {request: 15000},
                https: {rejectUnauthorized: false}
            });

        } catch (err) {
            Api.proxy_errors++;
            console.error('Proxy Error:', err);
        }
    }

    static async views(channel, post) {
        try {
            const res = await got(`https://t.me/${channel}/${post}`, {
                searchParams: {embed: '1', mode: 'tme'},
                headers: {
                    'referer': `https://t.me/${channel}/${post}`,
                    'user-agent': 'Mozilla/5.0'
                },
                https: {rejectUnauthorized: false}
            });

            const match = res.body.match(/<span class="tgme_widget_message_views">([^<]+)/);
            if (match) {
                Api.real_views = match[1];
            }
        } catch (err) {
            console.error('View count fetch failed:', err.message);
        }
    }
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const proxies = await ProxyModel.find({
        isConnected: true
    });
    for (const proxy of proxies) {

        (async () => {
            const api = new Api('digital550tel', '256'); // مثال: 'somechannel', '123'
            await Api.views('digital550tel', '256');
            console.log('Real views:', Api.real_views);

            await api.sendView(`${proxy.ip}:${proxy.port}`, proxy.type);

            console.log('Token errors:', Api.token_errors);
            console.log('Proxy errors:', Api.proxy_errors);
        })()
    }
})

module.exports = Api;

const { request } = require('undici');
const { CookieJar } = require('tough-cookie');
const {ProxyAgent} = require('proxy-agent');
const mongoose = require("mongoose");
const {ProxyModel} = require("./DB/ProxyModel");

class Api {
    static real_views = 0;
    static proxy_errors = 0;
    static token_errors = 0;

    constructor(channel, post) {
        this.url = 'https://t.me/';
        this.channel = channel;
        this.post = post;
    }

    getProxyAgent(proxy, proxyType) {
        const proxyUrl = `${proxyType}://${proxy}`;
        return new ProxyAgent(proxyUrl);
    }

    async sendView(proxy, proxyType) {
        const agent = this.getProxyAgent(proxy, proxyType);
        const jar = new CookieJar();

        try {
            const postUrl = `${this.url}${this.channel}/${this.post}?embed=1&mode=tme`;

            // Step 1: Load page and get view token
            const res1 = await request(postUrl, {
                method: 'GET',
                headers: {
                    'referer': postUrl,
                    'user-agent': 'Mozilla/5.0'
                },
                dispatcher: agent,
                cookieJar: jar
            });

            const bodyText = await res1.body.text();
            const match = bodyText.match(/data-view="([^"]+)"/);
            if (!match) {
                Api.token_errors++;
                return;
            }

            const viewToken = match[1];

            // Step 2: Send view trigger request
            await request('https://t.me/v/', {
                method: 'GET',
                query: { views: viewToken },
                headers: {
                    'referer': postUrl,
                    'x-requested-with': 'XMLHttpRequest',
                    'user-agent': 'Mozilla/5.0'
                },
                dispatcher: agent,
                cookieJar: jar
            });

        } catch (err) {
            Api.proxy_errors++;
            // console.error('Proxy error:', err.message);
        }
    }

    static async views(channel, post) {
        try {
            const res = await request(`https://t.me/${channel}/${post}?embed=1&mode=tme`, {
                method: 'GET',
                headers: {
                    'referer': `https://t.me/${channel}/${post}`,
                    'user-agent': 'Mozilla/5.0'
                },
                dispatcher: new ProxyAgent('direct://') // بدون پراکسی
            });

            const text = await res.body.text();
            const match = text.match(/<span class="tgme_widget_message_views">([^<]+)/);
            if (match) {
                Api.real_views = match[1];
            }
        } catch (err) {
            console.error('Fetch views error:', err.message);
        }
    }
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const proxies = await ProxyModel.find({
        isConnected: true
    });
    for (const proxy of proxies) {

        const api = new Api('digital550tel', '256'); // مثال: 'somechannel', '123'
        await Api.views('digital550tel', '256');
        console.log('Real views:', Api.real_views);

        await api.sendView(`${proxy.ip}:${proxy.port}`, proxy.type);

        console.log('Token errors:', Api.token_errors);
        console.log('Proxy errors:', Api.proxy_errors);
    }
})

module.exports = Api;

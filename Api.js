const axios = require('axios');
const {CookieJar} = require('tough-cookie');
const {wrapper} = require('axios-cookiejar-support');
const {SocksProxyAgent} = require('socks-proxy-agent');
const HttpProxyAgent = require('http-proxy-agent');
const HttpsProxyAgent = require('https-proxy-agent');
const https = require('https');
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

    getAgent(proxy, proxyType) {
        const proxyUrl = `${proxyType.toLowerCase()}://${proxy}`;

        switch (proxyType.toLowerCase()) {
            case 'http':
                return new HttpProxyAgent(proxyUrl);
            case 'https':
                const baseAgent = new HttpsProxyAgent(proxyUrl);
                baseAgent.options.rejectUnauthorized = false; // حذف چک SSL
                return baseAgent;
            case 'socks4':
                return new SocksProxyAgent(`socks4://${proxy}`);
            case 'socks5':
                return new SocksProxyAgent(`socks5://${proxy}`);
            default:
                return null;
        }
    }

    async sendView(proxy, proxyType) {
        const jar = new CookieJar();
        const agent = this.getAgent(proxy, proxyType);

        const client = wrapper(axios.create({
            jar,
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 15000,
            headers: {
                'referer': `${this.url}${this.channel}/${this.post}`,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36'
            }
        }));

        try {
            const response = await client.get(`${this.url}${this.channel}/${this.post}`, {
                params: {embed: '1', mode: 'tme'}
            });

            const viewTokenMatch = response.data.match(/data-view="([^"]+)"/);
            if (!viewTokenMatch) {
                Api.token_errors++;
                return;
            }

            const viewToken = viewTokenMatch[1];
            const cookieMap = await jar.getCookies('https://t.me');
            const cookieObj = Object.fromEntries(cookieMap.map(c => [c.key, c.value]));

            await client.get('https://t.me/v/', {
                params: {views: viewToken},
                headers: {
                    'referer': `https://t.me/${this.channel}/${this.post}?embed=1&mode=tme`,
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
                    'x-requested-with': 'XMLHttpRequest'
                },
                withCredentials: true,
                headersCookie: {
                    'stel_dt': '-240',
                    'stel_web_auth': 'https%3A%2F%2Fweb.telegram.org%2Fz%2F',
                    'stel_ssid': cookieObj.stel_ssid || '',
                    'stel_on': cookieObj.stel_on || ''
                }
            });

        } catch (err) {
            Api.proxy_errors++;
        }
    }

    static async views(channel, post) {
        try {
            const response = await axios.get(`https://t.me/${channel}/${post}`, {
                params: {embed: '1', mode: 'tme'},
                headers: {
                    'referer': `https://t.me/${channel}/${post}`,
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36'
                },
                httpsAgent: new https.Agent({rejectUnauthorized: false}) // حذف چک SSL حتی اینجا
            });

            const match = response.data.match(/<span class="tgme_widget_message_views">([^<]+)/);
            if (match) Api.real_views = match[1];
        } catch (err) {
            console.error('Error fetching views:', err.message);
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

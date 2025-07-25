import * as fs from 'fs';
import * as path from 'path';
import { HttpsProxyAgent } from 'https-proxy-agent';
import Log from '../../middlewares/Log';
import { Agent } from 'https'; // For httpsAgent type in Node.js

const getAgent = async (): Promise<Agent> => {
    try {
        const storagePath = path.join(__dirname, '../../../public/storages/');
        const proxiesPath = path.join(storagePath, "proxies.txt");
        if (!fs.existsSync(proxiesPath)) throw new Error('Proxy file not found.');
        
        const proxies = fs.readFileSync(proxiesPath, "utf-8").split("\n").filter(Boolean);
        if (proxies.length === 0) throw new Error('No proxies available.');
        
        const proxy = proxies[Math.floor(Math.random() * proxies.length)];
        const [ip, port, username, password] = proxy.split(":");
        if (!ip || !port || !username || !password) throw new Error(`Invalid proxy format: ${proxy}`);

        const proxyUrl = `http://${username}:${password}@${ip}:${port}`;
        return new HttpsProxyAgent(proxyUrl);
    } catch (error: any) {
        Log.error('❌ Lỗi khi lấy agent proxy:');
        throw error;
    }
};

export default getAgent;
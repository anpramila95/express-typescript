import { Novu } from '@novu/node';
import Locals from './Locals';
import Log from '../middlewares/Log';

class NovuProvider {
    public static novu: Novu;

    public static init(): void {
        const apiKey = Locals.config().novuApiKey;
        if (!apiKey) {
            Log.error('Novu API Key is missing in the environment variables.');
            // Thoát hoặc xử lý lỗi nếu không có API key
            process.exit(1);
        }
        this.novu = new Novu(apiKey);
        Log.info('Novu provider has been initialized.');
    }
}

export default NovuProvider;
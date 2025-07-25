/**
 * File này đăng ký tất cả các handler cho các công việc trong hàng đợi.
 */
import Queue from '../providers/Queue';
import Log from '../middlewares/Log';

// Import các handler của bạn
import MediaHandler from './handlers/MediaHandler';

class Worker {
    public static init(): void {
        Log.info('[Worker] Đang khởi chạy và đăng ký các jobs...');

        // Đăng ký handler cho job 'generate-ai-media'
        // Số '3' nghĩa là worker này có thể xử lý 3 job cùng một lúc.
        Queue.process('generate-ai-media', 3, MediaHandler.process);

        // Đăng ký các jobs khác ở đây nếu có
        // Queue.process('send-welcome-email', 10, EmailHandler.process);
    }
}

export default Worker;
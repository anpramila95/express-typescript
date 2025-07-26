import Notification from '../models/Notification';
import Log from '../middlewares/Log';

class NotificationService {
    /**
     * Hàm tập trung để tạo thông báo. 
     * Bất cứ khi nào cần tạo thông báo, chỉ cần gọi hàm này.
     */
    public static async create(
        userId: number,
        type: string,
        title: string,
        message: string
    ): Promise<void> {
        try {
            await Notification.create({ user_id: userId, type, title, message });
            Log.info(`Đã tạo thông báo '${title}' cho người dùng ID: ${userId}`);
        } catch (error) {
            Log.error(`[NotificationService] Lỗi khi tạo thông báo cho user ${userId}: ${error}`);
            // Có thể thêm logic retry hoặc báo lỗi cho admin ở đây
        }
    }
}

export default NotificationService;
import { Request, Response } from 'express';
import ApiKey from '../../models/ApiKey';
import Log from '../../middlewares/Log';

// Giả sử req.user chứa các thông tin này sau khi xác thực JWT
interface AuthenticatedUser {
    id: number;
    site_id: number; // ID của site mà user đang quản lý
}

class ApiKeyController {
    /**
     * Lấy danh sách các API key của người dùng.
     */
    public static async listKeys(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;

        try {
            const keys = await ApiKey.findAllForUser(user.id);
            return res.json({
                message: 'Danh sách API keys đã được lấy thành công.',
                keys: keys.map(key => ({
                    id: key.id,
                    apiKey: key.api_key,
                    status: key.status,
                    lastUsedAt: key.last_used_at
                }))
            });
        } catch (error) {
            Log.error(`Lỗi khi lấy danh sách API keys: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }

    /**
     * Tạo một API key mới.
     */

    public static async createKey(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;

        try {
            const countAllForUser = await ApiKey.countAllForUser(user.id);
            if (countAllForUser >= 5) {
                return res.status(400).json({ error: 'Bạn đã đạt giới hạn tối đa 5 API keys. Vui lòng thu hồi một key trước khi tạo key mới.' });
            }

            // Tạo key mới trong database
            const newKey = await ApiKey.create(user.id, user.site_id);

            // Trả về key mới này cho người dùng **CHỈ MỘT LẦN DUY NHẤT**
            return res.status(201).json({
                message: 'API Key đã được tạo thành công. Vui lòng sao chép và lưu lại ở nơi an toàn, bạn sẽ không thể xem lại nó.',
                apiKey: newKey
            });
        } catch (error) {
            Log.error(`Lỗi khi tạo API key: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }

    /**
     * Thu hồi (xóa) một API key.
     */
    public static async revokeKey(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { keyId } = req.params; // Lấy ID của key từ URL

        try {
            const success = await ApiKey.revoke(parseInt(keyId, 10), user.id);

            if (success) {
                return res.json({ message: 'Đã thu hồi API key thành công.' });
            } else {
                // Lỗi có thể do key không tồn tại hoặc không thuộc sở hữu của user
                return res.status(404).json({ error: 'Không tìm thấy API key hoặc bạn không có quyền thu hồi nó.' });
            }
        } catch (error) {
            Log.error(`Lỗi khi thu hồi API key: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }
}

export default ApiKeyController;
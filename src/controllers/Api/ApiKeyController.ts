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
                message: req.__('api_key.list_success'),
                keys: keys.map(key => ({
                    id: key.id,
                    apiKey: key.api_key,
                    status: key.status,
                    lastUsedAt: key.last_used_at
                }))
            });
        } catch (error) {
            Log.error(`Lỗi khi lấy danh sách API keys: ${error.stack}`);
            return res.status(500).json({ error: req.__('api_key.server_error') });
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
                return res.status(400).json({ error: req.__('api_key.limit_reached') });
            }

            // Tạo key mới trong database
            const newKey = await ApiKey.create(user.id, user.site_id);

            // Trả về key mới này cho người dùng **CHỈ MỘT LẦN DUY NHẤT**
            return res.status(201).json({
                message: req.__('api_key.created_success'),
                apiKey: newKey
            });
        } catch (error) {
            Log.error(`Lỗi khi tạo API key: ${error.stack}`);
            return res.status(500).json({ error: req.__('api_key.server_error') });
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
                return res.json({ message: req.__('api_key.revoked_success') });
            } else {
                // Lỗi có thể do key không tồn tại hoặc không thuộc sở hữu của user
                return res.status(404).json({ error: req.__('api_key.not_found_or_no_permission') });
            }
        } catch (error) {
            Log.error(`Lỗi khi thu hồi API key: ${error.stack}`);
            return res.status(500).json({ error: req.__('api_key.server_error') });
        }
    }
}

export default ApiKeyController;
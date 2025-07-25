import { Request, Response, NextFunction } from 'express';
import ApiKey from '../models/ApiKey';
import Log from './Log';

class ApiKeyMiddleware {
    /**
     * Middleware để xác thực request dựa trên API Key.
     */
    public static async authenticate(req: Request, res: Response, next: NextFunction): Promise<any> {
        // Lấy key từ header, ví dụ: 'X-API-Key'
        const apiKey = req.header('X-API-Key');

        if (!apiKey) {
            return res.status(401).json({ error: 'Unauthorized: API Key is missing.' });
        }

        try {
            const authenticatedUser = await ApiKey.findByKey(apiKey);

            if (authenticatedUser) {
                // Nếu key hợp lệ, gắn thông tin user và site vào request
                req.user = authenticatedUser;
                // req.siteId = authenticatedUser.site_id; // Gắn siteId nếu cần
                
                Log.info(`Request authenticated with API Key for user ID: ${authenticatedUser.id}`);
                return next(); // Cho phép request đi tiếp
            }

            return res.status(403).json({ error: 'Forbidden: Invalid API Key.' });
        } catch (error) {
            return res.status(500).json({ error: 'Server error during API Key authentication.' });
        }
    }
}

export default ApiKeyMiddleware;
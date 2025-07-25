import Database from '../providers/Database';
import Log from '../middlewares/Log';
import * as crypto from 'crypto';
import type * as mysql from 'mysql2';

export interface IApiKey {
    id: number;
    user_id: number;
    site_id: number;
    api_key: string;
    status: 'active' | 'revoked';
    last_used_at?: Date;
}

// Interface này sẽ được gắn vào request sau khi xác thực
export interface AuthenticatedRequestUser {
    id: number;
    email: string;
    site_id: number;
    isAdmin?: boolean; // Thêm trường isAdmin để xác định quyền admin
}


class ApiKey {
    /**
     * Tạo một chuỗi API key ngẫu nhiên, an toàn.
     */
    private static generateKey(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Tìm một key và thông tin user/site liên quan.
     * Chỉ trả về nếu key đang ở trạng thái 'active'.
     */
    public static async findByKey(key: string): Promise<AuthenticatedRequestUser | null> {
        const sql = `
            SELECT u.id, u.email, u.isAdmin, k.site_id
            FROM api_keys k
            JOIN users u ON k.user_id = u.id
            WHERE k.api_key = ? AND k.status = 'active'
            LIMIT 1
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [key]);
            if (rows.length > 0) {
                // Ghi nhận lần sử dụng cuối cùng (có thể chạy bất đồng bộ)
                this.recordUsage(key).catch(Log.error);
                return rows[0] as AuthenticatedRequestUser;
            }
            return null;
        } catch (error) {
            Log.error(`[ApiKeyModel] Lỗi khi tìm key: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Tạo một API key mới cho user và site.
     */
    public static async create(userId: number, siteId: number): Promise<string> {
        const newKey = this.generateKey();
        const sql = 'INSERT INTO api_keys (user_id, site_id, api_key) VALUES (?, ?, ?)';
        try {
            await Database.pool.execute(sql, [userId, siteId, newKey]);
            return newKey;
        } catch (error) {
            Log.error(`[ApiKeyModel] Lỗi khi tạo key mới: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Ghi nhận thời gian sử dụng key.
     */
    private static async recordUsage(key: string): Promise<void> {
        const sql = 'UPDATE api_keys SET last_used_at = NOW() WHERE api_key = ?';
        await Database.pool.execute(sql, [key]);
    }

    /**
     * Lấy tất cả các API key của một người dùng cho một site cụ thể.
     * Che đi một phần của key để bảo mật.
     */
    public static async findAllForUser(userId: number): Promise<any[]> {
        const sql = 'SELECT id, api_key, status, last_used_at, created_at FROM api_keys WHERE user_id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
            // Che bớt key để không hiển thị toàn bộ trên giao diện
            return rows.map(key => ({
                ...key,
                display_key: `...${key.api_key.slice(-8)}` // Chỉ hiện 8 ký tự cuối
            }));
        } catch (error) {
            Log.error(`[ApiKeyModel] Lỗi khi lấy danh sách key cho user ${userId}: ${error.message}`);
            throw error;
        }
    }

    //count all active key
    public static async countAllForUser(userId: number): Promise<any> {
        const sql = 'SELECT id, api_key, status, last_used_at, created_at FROM api_keys WHERE user_id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
            return rows.length;
        } catch (error) {
            Log.error(`[ApiKeyModel] Lỗi khi lấy danh sách key cho user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Thu hồi (vô hiệu hóa) một API key.
     * @param keyId ID của key cần thu hồi.
     * @param userId ID của người dùng (để đảm bảo họ chỉ xóa key của mình).
     * @returns `true` nếu thu hồi thành công.
     */
    public static async revoke(keyId: number, userId: number): Promise<boolean> {
        const sql = 'UPDATE api_keys SET status = "revoked" WHERE id = ? AND user_id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [keyId, userId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[ApiKeyModel] Lỗi khi thu hồi key ID ${keyId}: ${error.message}`);
            throw error;
        }
    }
}


export default ApiKey;
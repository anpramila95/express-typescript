import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

interface BlockData {
    siteId: number;
    userId: number;
    adminId: number;
    reason?: string;
}

// Interface cho một bản ghi khóa
export interface IBlockDetails {
    id: number;
    site_id: number;
    user_id: number;
    admin_id: number;
    reason?: string;
    created_at: Date;
}


class BlockedUser {
    /**
     * Khóa một người dùng trên một trang web cụ thể.
     */
    public static async block(data: BlockData): Promise<boolean> {
        const sql = 'INSERT INTO blocked_users (site_id, user_id, admin_id, reason) VALUES (?, ?, ?, ?)';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.siteId, data.userId, data.adminId, data.reason || null
            ]);
            return result.affectedRows > 0;
        } catch (error) {
            // Bắt lỗi duplicate key nếu user đã bị khóa rồi
            if (error.code === 'ER_DUP_ENTRY') {
                Log.warn(`[BlockedUserModel] User ID ${data.userId} đã bị khóa trên site ID ${data.siteId}.`);
                return true; // Coi như thành công vì kết quả cuối cùng là user bị khóa
            }
            Log.error(`[BlockedUserModel] Lỗi khi khóa user: ${error.message}`);
            throw error;
        }
    }

    /**
     * Mở khóa cho một người dùng trên một trang web.
     */
    public static async unblock(siteId: number, userId: number): Promise<boolean> {
        const sql = 'DELETE FROM blocked_users WHERE site_id = ? AND user_id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [siteId, userId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[BlockedUserModel] Lỗi khi mở khóa user: ${error.message}`);
            throw error;
        }
    }

    /**
     * Kiểm tra xem một người dùng có đang bị khóa trên một trang web hay không.
     */
    public static async isBlocked(siteId: number, userId: number): Promise<boolean> {
        const sql = 'SELECT id FROM blocked_users WHERE site_id = ? AND user_id = ? LIMIT 1';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [siteId, userId]);
            return rows.length > 0;
        } catch (error) {
            Log.error(`[BlockedUserModel] Lỗi khi kiểm tra trạng thái khóa: ${error.message}`);
            // Mặc định trả về false nếu có lỗi để tránh khóa nhầm người dùng
            return false;
        }
    }
    public static async findBlockDetails(userId: number): Promise<IBlockDetails | null> {
        const sql = 'SELECT * FROM blocked_users WHERE user_id = ? LIMIT 1';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
            return rows.length > 0 ? (rows[0] as IBlockDetails) : null;
        } catch (error) {
            Log.error(`[BlockedUserModel] Lỗi khi kiểm tra trạng thái khóa: ${error.message}`);
            return null; // Trả về null nếu có lỗi để tránh khóa nhầm
        }
    }
}

export default BlockedUser;
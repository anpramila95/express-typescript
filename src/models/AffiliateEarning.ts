import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

interface EarningData {
    userId: number;
    sourceUserId: number;
    sourceTransactionId: number;
    commissionAmount: number;
    commissionRate: number;
}

class AffiliateEarning {
    /**
     * Ghi lại một khoản hoa hồng mới vào database.
     */
    public static async create(data: EarningData): Promise<boolean> {
        const sql = `
            INSERT INTO affiliate_earnings 
            (user_id, source_user_id, source_transaction_id, commission_amount, commission_rate) 
            VALUES (?, ?, ?, ?, ?)
        `;
        try {
            await Database.pool.execute(sql, [
                data.userId,
                data.sourceUserId,
                data.sourceTransactionId,
                data.commissionAmount,
                data.commissionRate
            ]);
            return true;
        } catch (error) {
            Log.error(`[AffiliateEarningModel] Lỗi khi tạo bản ghi hoa hồng: ${error.message}`);
            throw error;
        }
    }


    /**
     * Lấy lịch sử nhận hoa hồng của một người dùng (có phân trang).
     * @param userId - ID của người dùng.
     * @param options - Tùy chọn phân trang { limit, offset }.
     * @returns Một object chứa danh sách các bản ghi và tổng số lượng.
     */
    public static async findAllForUser(
        userId: number,
        options: { limit: number; offset: number }
    ): Promise<{ items: any[]; total: number }> {
        
        // --- Truy vấn để lấy tổng số bản ghi ---
        const countSql = 'SELECT COUNT(*) as total FROM affiliate_earnings WHERE user_id = ?';
        
        // --- Truy vấn để lấy dữ liệu đã phân trang ---
        const dataSql = `
            SELECT 
                ae.id,
                ae.commission_amount,
                ae.commission_rate,
                ae.created_at,
                u.fullname AS source_user_name,
                t.description AS source_transaction_description
            FROM affiliate_earnings AS ae
            JOIN users AS u ON ae.source_user_id = u.id
            JOIN transactions AS t ON ae.source_transaction_id = t.id
            WHERE ae.user_id = ?
            ORDER BY ae.created_at DESC
            LIMIT ? OFFSET ?
        `;

        try {
            // Thực hiện cả hai truy vấn song song để tăng hiệu suất
            const [[countRows], [items]] = await Promise.all([
                Database.pool.query<mysql.RowDataPacket[]>(countSql, [userId]),
                Database.pool.query<mysql.RowDataPacket[]>(dataSql, [userId, options.limit, options.offset])
            ]);

            const total = countRows[0].total || 0;
            
            return { items, total };

        } catch (error) {
            Log.error(`[AffiliateEarningModel] Lỗi khi lấy lịch sử hoa hồng cho user ID ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tính tổng thu nhập hoa hồng của một người dùng.
     */
    public static async getTotalEarnings(userId: number): Promise<number> {
        const sql = 'SELECT SUM(commission_amount) as total FROM affiliate_earnings WHERE user_id = ?';
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
        return rows.length > 0 ? (rows[0].total || 0) : 0;
    }

    /**
     * Tính tổng số tiền đã được duyệt rút.
     */
    public static async getTotalWithdrawn(userId: number): Promise<number> {
        const sql = "SELECT SUM(amount) as total FROM withdrawal_requests WHERE user_id = ? AND status = 'approved'";
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
        return rows.length > 0 ? (rows[0].total || 0) : 0;
    }
    
}

export default AffiliateEarning;
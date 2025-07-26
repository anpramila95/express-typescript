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


// Interface cho một bản ghi hoa hồng chi tiết
export interface IEarningDetail {
    amount: number;
    description: string;
    created_at: Date;
}

// Interface cho một người dùng F1, bao gồm lịch sử hoa hồng
export interface IDirectDownlineUserDetail {
    id: number;
    name: string;
    email: string;
    join_date: Date;
    total_earnings_from_user: number;
    earnings_history: IEarningDetail[];
}
// Interface cho kết quả trả về của hàm, bao gồm cả tổng số
export interface IDownlinePagedResult {
    items: IDirectDownlineUserDetail[];
    total: number;
}



class AffiliateEarning {

    /**
     * Lấy danh sách người dùng F1 (cấp 1) và chi tiết hoa hồng từ mỗi người (có phân trang).
     * @param userId ID của người giới thiệu
     * @param options Tùy chọn phân trang { limit, offset }
     * @returns Danh sách người dùng F1 trong trang và tổng số người dùng F1.
     */
    public static async getDirectDownlineDetails(
        userId: number,
        options: { limit: number; offset: number }
    ): Promise<IDownlinePagedResult> {
        const connection = await Database.pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Đếm tổng số người dùng F1 để phân trang
            const countSql = `SELECT COUNT(id) as total FROM users WHERE affiliate_id = ?`;
            const [countRows] = await connection.query<mysql.RowDataPacket[]>(countSql, [userId]);
            const total = countRows[0].total;

            if (total === 0) {
                return { items: [], total: 0 };
            }

            // 2. Lấy ID của những người dùng F1 trên trang hiện tại
            const usersSql = `
                SELECT id FROM users WHERE affiliate_id = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?;
            `;
            const [userRows] = await connection.query<mysql.RowDataPacket[]>(usersSql, [
                userId,
                options.limit,
                options.offset
            ]);

            if (userRows.length === 0) {
                return { items: [], total };
            }
            const userIdsOnPage = userRows.map(row => row.id);

            // 3. Lấy chi tiết user và toàn bộ hoa hồng của những user trên trang này
            const detailsSql = `
                SELECT
                    u.id, u.name, u.email, u.created_at AS join_date,
                    ae.amount, ae.description, ae.created_at AS earning_date
                FROM users u
                LEFT JOIN affiliate_earnings ae ON u.id = ae.source_user_id AND ae.user_id = ?
                WHERE u.id IN (?)
                ORDER BY u.created_at DESC, ae.created_at DESC;
            `;
            const [detailRows] = await connection.query<mysql.RowDataPacket[]>(detailsSql, [userId, userIdsOnPage]);

            await connection.commit();

            // 4. Xử lý dữ liệu thô thành cấu trúc lồng nhau (giống như trước)
            const userMap = new Map<number, IDirectDownlineUserDetail>();
            for (const row of detailRows) {
                if (!userMap.has(row.id)) {
                    userMap.set(row.id, {
                        id: row.id,
                        name: row.name,
                        email: row.email,
                        join_date: row.join_date,
                        total_earnings_from_user: 0,
                        earnings_history: []
                    });
                }
                const userDetail = userMap.get(row.id)!;
                if (row.amount !== null) {
                    userDetail.earnings_history.push({
                        amount: row.amount,
                        description: row.description,
                        created_at: row.earning_date
                    });
                    userDetail.total_earnings_from_user += parseFloat(row.amount);
                }
            }

            return { items: Array.from(userMap.values()), total };

        } catch (error) {
            await connection.rollback();
            Log.error(`[AffiliateEarningModel] Lỗi khi lấy chi tiết F1 downline cho user ${userId}: ${error.message}`);
            throw error;
        } finally {
            connection.release();
        }
    }
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
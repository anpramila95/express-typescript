// src/models/WithdrawalRequest.ts
import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

interface RequestData {
    userId: number;
    amount: number;
    paymentDetails: object;
}


// Tùy chọn để lọc và phân trang
interface FindAllOptions {
    status?: 'pending' | 'approved' | 'rejected';
    userId?: number;
    limit?: number;
    offset?: number;
}

class WithdrawalRequest {
    /**
     * Tạo một yêu cầu rút tiền mới.
     */
    public static async create(data: RequestData): Promise<{ id: number }> {
        const sql = 'INSERT INTO withdrawal_requests (user_id, amount, payment_details) VALUES (?, ?, ?)';
        const detailsString = JSON.stringify(data.paymentDetails);
        const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [data.userId, data.amount, detailsString]);
        return { id: result.insertId };
    }
    
    /**
     * Lấy tất cả các yêu cầu đang chờ duyệt.
     */
    public static async findAllPending(): Promise<any[]> {
        const sql = 'SELECT * FROM withdrawal_requests WHERE status = "pending" ORDER BY created_at ASC';
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql);
        return rows;
    }

    /**
     * Cập nhật trạng thái một yêu cầu.
     */
    public static async updateStatus(id: number, status: 'approved' | 'rejected', adminNotes: string): Promise<boolean> {
        const sql = 'UPDATE withdrawal_requests SET status = ?, admin_notes = ? WHERE id = ?';
        const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [status, adminNotes, id]);
        return result.affectedRows > 0;
    }


    /**
     * Lấy thông tin chi tiết của một yêu cầu rút tiền, bao gồm cả thông tin người dùng.
     * Dành cho admin sử dụng.
     */
    public static async findDetailsById(id: number): Promise<any | null> {
        const sql = `
            SELECT 
                wr.*,
                u.fullname,
                u.email
            FROM withdrawal_requests AS wr
            JOIN users AS u ON wr.user_id = u.id
            WHERE wr.id = ?
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
            if (rows.length > 0) {
                const request = rows[0];
                // Phân giải chuỗi JSON chứa thông tin thanh toán
                if (request.payment_details && typeof request.payment_details === 'string') {
                    request.payment_details = JSON.parse(request.payment_details);
                }
                return request;
            }
            return null;
        } catch (error) {
            Log.error(`[WithdrawalRequestModel] Lỗi khi tìm chi tiết yêu cầu ID ${id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy danh sách yêu cầu rút tiền với các bộ lọc và phân trang.
     * Tự động đính kèm thông tin người dùng.
     */
    public static async findAll(options: FindAllOptions): Promise<{ items: any[]; total: number }> {
        const { status, userId, limit = 15, offset = 0 } = options;

        let whereClauses: string[] = [];
        let params: (string | number)[] = [];

        // Thêm các điều kiện lọc vào truy vấn
        if (status) {
            whereClauses.push('wr.status = ?');
            params.push(status);
        }
        if (userId) {
            whereClauses.push('wr.user_id = ?');
            params.push(userId);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // --- Truy vấn để đếm tổng số bản ghi ---
        const countSql = `SELECT COUNT(*) as total FROM withdrawal_requests as wr ${whereSql}`;

        // --- Truy vấn để lấy dữ liệu chi tiết ---
        const dataSql = `
            SELECT 
                wr.*,
                u.fullname,
                u.email
            FROM withdrawal_requests AS wr
            JOIN users AS u ON wr.user_id = u.id
            ${whereSql}
            ORDER BY wr.created_at DESC
            LIMIT ? OFFSET ?
        `;

        try {
            // Thực hiện cả hai truy vấn song song
            const [[countRows], [items]] = await Promise.all([
                Database.pool.query<mysql.RowDataPacket[]>(countSql, params),
                Database.pool.query<mysql.RowDataPacket[]>(dataSql, [...params, limit, offset])
            ]);

            const total = countRows[0].total || 0;
            
            // Phân giải chuỗi JSON cho mỗi item
            const processedItems = items.map(item => {
                if (item.payment_details && typeof item.payment_details === 'string') {
                    item.payment_details = JSON.parse(item.payment_details);
                }
                return item;
            });

            return { items: processedItems, total };

        } catch (error) {
            Log.error(`[WithdrawalRequestModel] Lỗi khi lấy danh sách yêu cầu: ${error.message}`);
            throw error;
        }
    }
}

export default WithdrawalRequest;
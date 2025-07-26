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

// Định nghĩa các interface cần thiết
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected';

export interface IWithdrawalRequest {
    id: number;
    userId: number;
    amount: number;
    status: WithdrawalStatus;
    paymentDetails: string;
    created_at: Date;
    updated_at: Date;
    // Thêm các trường khác nếu có, ví dụ: user's name
    user_name?: string;
    user_email?: string;
}

export interface IWithdrawalPagedResult {
    items: IWithdrawalRequest[];
    total: number;
}

// Tùy chọn để lọc và phân trang
export interface IFindAllOptions {
    userId?: number; // ID của người dùng để lọc
    status?: WithdrawalStatus;
    limit: number;
    offset: number;
    site_id: number; // Thêm site_id để kiểm soát quyền truy cập
}

class WithdrawalRequest {
    /**
     * Tìm tất cả các yêu cầu rút tiền với tùy chọn lọc theo status và phân trang.
     * @param options Tùy chọn bao gồm status, limit, offset
     * @returns Danh sách các yêu cầu và tổng số lượng.
     */
    public static async findAndCountAll(options: IFindAllOptions): Promise<IWithdrawalPagedResult> {
        // Xây dựng câu lệnh WHERE một cách linh hoạt
        let whereClause = '';
        const params: (string | number)[] = [];

        if (options.status) {
            whereClause = 'WHERE wr.status = ?';
            params.push(options.status);
        }

        if (options.site_id) {
            if (whereClause) {
                whereClause += ' AND wr.site_id = ?';
            } else {
                whereClause = 'WHERE wr.site_id = ?';
            }
            params.push(options.site_id);
        }


        if( options.userId) {
            if (whereClause) {
                whereClause += ' AND wr.user_id = ?';
            } else {
                whereClause = 'WHERE wr.user_id = ?';
            }
            params.push(options.userId);
        }

        // Câu lệnh đếm tổng số bản ghi khớp với điều kiện
        const countSql = `SELECT COUNT(wr.id) as total FROM withdrawal_requests wr ${whereClause}`;

        // Câu lệnh lấy dữ liệu chi tiết, join với bảng users để có thêm thông tin
        const dataSql = `
            SELECT wr.*, u.name as user_name, u.email as user_email
            FROM withdrawal_requests wr
            JOIN users u ON wr.userId = u.id
            ${whereClause}
            ORDER BY wr.created_at DESC
            LIMIT ? OFFSET ?
        `;

        try {
            // Đếm tổng số
            const [countRows] = await Database.pool.query<mysql.RowDataPacket[]>(countSql, params);
            const total = countRows[0].total;

            if (total === 0) {
                return { items: [], total: 0 };
            }

            // Lấy dữ liệu của trang hiện tại
            const dataParams = [...params, options.limit, options.offset];
            const [dataRows] = await Database.pool.query<mysql.RowDataPacket[]>(dataSql, dataParams);

            return { items: dataRows as IWithdrawalRequest[], total };

        } catch (error) {
            Log.error(`[WithdrawalRequestModel] Lỗi khi tìm yêu cầu rút tiền: ${error.message}`);
            throw error;
        }
    }

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
}

export default WithdrawalRequest;
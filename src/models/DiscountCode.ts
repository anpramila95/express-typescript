import type * as mysql from 'mysql2';
import Database from '../providers/Database';
import Log from '../middlewares/Log';

export interface IDiscountCode {
    id: number;
    code: string;
    discount_type: 'percentage' | 'fixed_amount';
    discount_value: number;
    description?: string;
    max_uses?: number;
    current_uses: number;
    expires_at?: Date | null;
    status: 'active' | 'inactive' | 'expired';
}

class DiscountCode {
    /**
     * Tìm một mã giảm giá hợp lệ bằng code.
     * Hợp lệ nghĩa là: status = 'active' và chưa hết hạn, chưa hết lượt dùng.
     */
    public static async findValidCode(code: string): Promise<IDiscountCode | null> {
        const sql = `
            SELECT * FROM discount_codes
            WHERE code = ? AND status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
              AND (max_uses IS NULL OR current_uses < max_uses)
            LIMIT 1
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [code]);
            if (rows.length > 0) {
                return rows[0] as IDiscountCode;
            }
            return null;
        } catch (error) {
            Log.error(`[DiscountCodeModel] Lỗi khi tìm mã: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tính toán giá cuối cùng sau khi áp dụng mã.
     */
    public static calculateDiscountedAmount(originalAmount: number, discount: IDiscountCode): number {
        if (discount.discount_type === 'percentage') {
            const discountAmount = originalAmount * (discount.discount_value / 100);
            return Math.max(0, originalAmount - discountAmount); // Đảm bảo giá không âm
        } else { // fixed_amount
            return Math.max(0, originalAmount - discount.discount_value);
        }
    }

    /**
     * Tăng số lượt đã sử dụng của một mã.
     */
    public static async incrementUses(codeId: number): Promise<boolean> {
        const sql = 'UPDATE discount_codes SET current_uses = current_uses + 1 WHERE id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [codeId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[DiscountCodeModel] Lỗi khi tăng lượt sử dụng cho mã ID ${codeId}: ${error.message}`);
            throw error;
        }
    }

    public static async create(data: Omit<IDiscountCode, 'id' | 'current_uses' | 'status'>): Promise<IDiscountCode> {
    const sql = `
        INSERT INTO discount_codes (code, discount_type, discount_value, description, max_uses, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    try {
        const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
            data.code,
            data.discount_type,
            data.discount_value,
            data.description || null,
            data.max_uses || null,
            data.expires_at || null,
        ]);
        return { id: result.insertId, current_uses: 0, status: 'active', ...data };
    } catch (error) {
        Log.error(`[DiscountCodeModel] Lỗi khi tạo mã giảm giá: ${error.message}`);
        throw error;
    }
}
}

export default DiscountCode;
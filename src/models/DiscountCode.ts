import type * as mysql from 'mysql2';
import Database from '../providers/Database';
import Log from '../middlewares/Log';

export interface IDiscountCode {
    id: number;
    site_id: number; // Thêm site_id để mã giảm giá thuộc về site cụ thể
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
     * Tìm một mã giảm giá hợp lệ bằng code trong site cụ thể.
     * Hợp lệ nghĩa là: status = 'active' và chưa hết hạn, chưa hết lượt dùng.
     */
    public static async findValidCode(code: string, siteId: number): Promise<IDiscountCode | null> {
        const sql = `
            SELECT * FROM discount_codes
            WHERE code = ? AND site_id = ? AND status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
              AND (max_uses IS NULL OR current_uses < max_uses)
            LIMIT 1
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [code, siteId]);
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
            INSERT INTO discount_codes (site_id, code, discount_type, discount_value, description, max_uses, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.site_id,
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

    // Thêm method để lấy tất cả discount codes theo site
    public static async findAllBySiteId(siteId: number): Promise<IDiscountCode[]> {
        const sql = 'SELECT * FROM discount_codes WHERE site_id = ? ORDER BY created_at DESC';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [siteId]);
            return rows as IDiscountCode[];
        } catch (error) {
            Log.error(`[DiscountCodeModel] Lỗi khi lấy tất cả mã giảm giá cho site ID ${siteId}: ${error.message}`);
            throw error;
        }
    }

    // Thêm method để update discount code với site check
    public static async update(id: number, siteId: number, data: Partial<Omit<IDiscountCode, 'id' | 'site_id'>>): Promise<boolean> {
        const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
        const values = Object.values(data);

        const sql = `UPDATE discount_codes SET ${fields} WHERE id = ? AND site_id = ?`;
        
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [...values, id, siteId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[DiscountCodeModel] Lỗi khi cập nhật mã giảm giá ID ${id}: ${error.message}`);
            throw error;
        }
    }

    // Thêm method để delete discount code với site check
    public static async delete(id: number, siteId: number): Promise<boolean> {
        const sql = 'DELETE FROM discount_codes WHERE id = ? AND site_id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [id, siteId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[DiscountCodeModel] Lỗi khi xóa mã giảm giá ID ${id}: ${error.message}`);
            throw error;
        }
    }
}

export default DiscountCode;
import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

export interface IPricingPlan {
    id: number;
    plan_id: number;
    site_id: number; // Thêm site_id để kiểm soát quyền truy cập
    price: number;
    currency: string;
    duration_days: number;
    name: string;
    start_date?: Date;
    end_date?: Date;
    status: 'active' | 'inactive';
}

class PricingPlan {
    /**
     * Chuyển đổi một hàng dữ liệu từ database thành object IPricingPlan.
     */
    private static parse(row: mysql.RowDataPacket): IPricingPlan {
        return {
            id: row.id,
            plan_id: row.plan_id,
            site_id: row.site_id, // Thêm site_id từ database
            price: parseFloat(row.price),
            currency: row.currency,
            duration_days: row.duration_days,
            name: row.name,
            start_date: row.start_date,
            end_date: row.end_date,
            status: row.status,
        };
    }

    /**
     * Tìm một gói giá bằng ID.
     */
    public static async findById(id: number): Promise<IPricingPlan | null> {
        const sql = 'SELECT * FROM pricing_plans WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
            if (rows.length > 0) {
                return this.parse(rows[0]);
            }
            return null;
        } catch (error) {
            Log.error(`[PricingPlanModel] Lỗi khi tìm gói giá bằng ID ${id}: ${error.message}`);
            throw error;
        }
    }
    //findByIdSiteId
    public static async findByIdSiteId(id: number, siteId: number): Promise<IPricingPlan | null> {
        const sql = 'SELECT * FROM pricing_plans WHERE id = ? AND site_id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id, siteId]);
            if (rows.length > 0) {
                return this.parse(rows[0]);
            }
            return null;
        } catch (error) {
            Log.error(`[PricingPlanModel] Lỗi khi tìm gói giá bằng ID ${id} và site ID ${siteId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Admin tạo một gói giá mới cho một Subscription Plan.
     */
    public static async create(data: {
        plan_id: number;
        site_id: number; // Thêm site_id parameter
        name: string;
        price: number;
        currency: string;
        duration_days: number;
        start_date?: Date;
        end_date?: Date;
    }): Promise<IPricingPlan> {
        const sql = `
            INSERT INTO pricing_plans (plan_id, site_id, name, price, currency, duration_days, start_date, end_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `;
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.plan_id,
                data.site_id, // Thêm site_id vào query
                data.name,
                data.price,
                data.currency,
                data.duration_days,
                data.start_date || null,
                data.end_date || null
            ]);
            // Trả về gói giá vừa tạo
            const newPricingPlan: IPricingPlan = {
                id: result.insertId,
                status: 'active',
                ...data
            };
            return newPricingPlan;
        } catch (error) {
            Log.error(`[PricingPlanModel] Lỗi khi tạo gói giá mới: ${error.message}`);
            throw error;
        }
    }

    public static async findAllByPlanId(plan_id: number, siteId?: number): Promise<IPricingPlan[]> {
        let sql = 'SELECT * FROM pricing_plans WHERE plan_id = ? AND status = "active"';
        const params: any[] = [plan_id];

        if (siteId) {
            sql += ' AND site_id = ?';
            params.push(siteId);
        }

        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, params);
            return rows.map(this.parse);
        } catch (error) {
            Log.error(`[PricingPlanModel] Lỗi khi lấy tất cả gói giá cho plan ID ${plan_id}: ${error.message}`);
            throw error;
        }
    }

    // Thêm method để lấy pricing plan theo site
    public static async findAllBySiteId(siteId: number): Promise<IPricingPlan[]> {
        const sql = 'SELECT * FROM pricing_plans WHERE site_id = ? AND status = "active"';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [siteId]);
            return rows.map(this.parse);
        } catch (error) {
            Log.error(`[PricingPlanModel] Lỗi khi lấy tất cả gói giá cho site ID ${siteId}: ${error.message}`);
            throw error;
        }
    }

    // Thêm method để update pricing plan với site check
    public static async update(id: number, siteId: number, data: Partial<Omit<IPricingPlan, 'id' | 'site_id'>>): Promise<boolean> {
        const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
        const values = Object.values(data);

        const sql = `UPDATE pricing_plans SET ${fields} WHERE id = ? AND site_id = ?`;

        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [...values, id, siteId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[PricingPlanModel] Lỗi khi cập nhật gói giá ID ${id}: ${error.message}`);
            throw error;
        }
    }

    // Thêm method để delete pricing plan với site check
    public static async delete(id: number, siteId: number): Promise<boolean> {
        const sql = 'DELETE FROM pricing_plans WHERE id = ? AND site_id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [id, siteId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[PricingPlanModel] Lỗi khi xóa gói giá ID ${id}: ${error.message}`);
            throw error;
        }
    }
}

export default PricingPlan;
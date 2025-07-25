import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

export interface IPricingPlan {
    id: number;
    plan_id: number;
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

    /**
     * Admin tạo một gói giá mới cho một Subscription Plan.
     */
    public static async create(data: {
        plan_id: number;
        name: string;
        price: number;
        currency: string;
        duration_days: number;
        start_date?: Date;
        end_date?: Date;
    }): Promise<IPricingPlan> {
        const sql = `
            INSERT INTO pricing_plans (plan_id, name, price, currency, duration_days, start_date, end_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        `;
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.plan_id,
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

    public static async findAllByPlanId(plan_id: number): Promise<IPricingPlan[]> {
        const sql = 'SELECT * FROM pricing_plans WHERE plan_id = ? AND status = "active"';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [plan_id]);
            return rows.map(this.parse);
        } catch (error) {
            Log.error(`[PricingPlanModel] Lỗi khi lấy tất cả gói giá cho plan ID ${plan_id}: ${error.message}`);
            throw error;
        }
    }
}

export default PricingPlan;
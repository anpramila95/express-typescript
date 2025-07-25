import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

export interface ISubscriptionPlan {
    id: number;
    name: string;
    description?: string;
    price: number;
    currency: string;
    max_concurrent_jobs: number;
    options?: any; // Thuộc tính 'options' sẽ là một object
}

// Kiểu dữ liệu cho việc tạo và cập nhật, không bao gồm 'id'
type PlanData = Omit<ISubscriptionPlan, 'id'>;

class SubscriptionPlan {

    /**
     * Chuyển đổi một dòng dữ liệu từ DB, phân giải trường 'options'
     */
    private static parsePlan(plan: mysql.RowDataPacket): ISubscriptionPlan {
        let optionsObject = null;
        if (plan.options && typeof plan.options === 'string') {
            try {
                optionsObject = JSON.parse(plan.options);
            } catch (error) {
                Log.error(`[SubscriptionPlanModel] Lỗi phân giải options cho plan ID ${plan.id}: ${error.message}`);
            }
        }
        return { ...plan, options: optionsObject } as ISubscriptionPlan;
    }

    /**
     * Lấy tất cả các gói dịch vụ.
     */
    public static async findAll(): Promise<ISubscriptionPlan[]> {
        const sql = 'SELECT * FROM subscription_plans ORDER BY price ASC';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql);
            return rows.map(this.parsePlan);
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi lấy tất cả gói: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm một gói dịch vụ bằng ID.
     */
    public static async findById(id: number): Promise<ISubscriptionPlan | null> {
        const sql = 'SELECT * FROM subscription_plans WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
            return rows.length > 0 ? this.parsePlan(rows[0]) : null;
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi tìm gói bằng ID ${id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tạo một gói dịch vụ mới.
     * @param data - Dữ liệu của gói mới (không bao gồm id).
     * @returns ID của gói vừa được tạo.
     */
    public static async create(data: PlanData): Promise<{ id: number }> {
        const sql = `
            INSERT INTO subscription_plans 
            (name, description, price, currency, max_concurrent_jobs, options) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        // Chuyển 'options' thành chuỗi JSON trước khi lưu
        const optionsString = data.options ? JSON.stringify(data.options) : null;
        
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.name,
                data.description,
                data.price,
                data.currency,
                data.max_concurrent_jobs,
                optionsString
            ]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi tạo gói mới: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cập nhật một gói dịch vụ đã có.
     * @param id - ID của gói cần cập nhật.
     * @param data - Dữ liệu cần cập nhật.
     * @returns `true` nếu cập nhật thành công, `false` nếu không.
     */
    public static async update(id: number, data: Partial<PlanData>): Promise<boolean> {
        // Xử lý 'options' nếu nó được cung cấp trong dữ liệu cập nhật
        if (data.options) {
            data.options = JSON.stringify(data.options);
        }

        const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
        const values = Object.values(data);
        
        const sql = `UPDATE subscription_plans SET ${fields} WHERE id = ?`;

        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [...values, id]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi cập nhật gói ID ${id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa một gói dịch vụ.
     * @param id - ID của gói cần xóa.
     * @returns `true` nếu xóa thành công, `false` nếu không.
     */
    public static async delete(id: number): Promise<boolean> {
        const sql = 'DELETE FROM subscription_plans WHERE id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi xóa gói ID ${id}: ${error.message}`);
            throw error;
        }
    }
}

export default SubscriptionPlan;
import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

export interface ISubscriptionPlan {
    id: number;
    site_id: number; // Thay đổi từ user_id thành site_id để rõ ràng hơn
    name: string;
    description?: string;
    // Xóa price và currency
    max_concurrent_jobs: number;
    options?: any;
    pricings?: any[]; // Thêm để chứa các gói giá
    pricing_name?: string; // <-- ADD THIS LINE
    expires_at?: Date | null; // Thêm để chứa ngày hết hạn nếu có
}

// Kiểu dữ liệu cho việc tạo và cập nhật, không bao gồm 'id'
type PlanData = Omit<ISubscriptionPlan, 'id'>;

class SubscriptionPlan {
    /**
         * Chuyển đổi một hàng dữ liệu từ database thành object ISubscriptionPlan.
         * Xử lý cả chuỗi JSON của pricings.
         */
    private static parsePlan(row: mysql.RowDataPacket): ISubscriptionPlan {
        let pricings = [];
        // Pricings có thể là NULL nếu không có gói giá nào khớp
        if (row.pricings) {
            try {
                // MySQL trả về pricings dưới dạng string, cần parse nó
                const parsedPricings = JSON.parse(row.pricings);
                // JSON_ARRAYAGG trả về [null] nếu không có dòng nào, lọc nó ra
                if (Array.isArray(parsedPricings) && parsedPricings[0] !== null) {
                    pricings = parsedPricings;
                }
            } catch (e) {
                Log.error(`[SubscriptionPlanModel] Lỗi khi parse JSON pricing: ${e.message}`);
            }
        }

        return {
            id: row.id,
            site_id: row.site_id, // Thêm site_id từ database
            name: row.name,
            description: row.description,
            max_concurrent_jobs: row.max_concurrent_jobs,
            options: row.options ? JSON.parse(row.options) : undefined,
            pricings: pricings,
            expires_at: row.expires_at ? new Date(row.expires_at) : null // Chuyển đổi sang Date nếu có
        };
    }

    /**
     * Lấy tất cả các gói subscription cùng với các gói giá đang hoạt động của chúng.
     */
    public static async findAllWithPricing(): Promise<ISubscriptionPlan[]> {
        const sql = `
            SELECT
                sp.id,
                sp.name,
                sp.description,
                sp.max_concurrent_jobs,
                sp.options,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', pp.id,
                        'name', pp.name,
                        'price', pp.price,
                        'currency', pp.currency,
                        'duration_days', pp.duration_days
                    )
                ) as pricings
            FROM
                subscription_plans sp
            LEFT JOIN
                pricing_plans pp ON sp.id = pp.plan_id
            WHERE
                pp.status = 'active'
                AND (pp.start_date IS NULL OR pp.start_date <= NOW())
                AND (pp.end_date IS NULL OR pp.end_date >= NOW())
            GROUP BY
                sp.id
            ORDER BY
                sp.id ASC
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql);
            return rows.map(this.parsePlan);
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi lấy tất cả gói kèm giá: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm một gói bằng ID (không cần thông tin giá).
     */
    public static async findById(id: number): Promise<ISubscriptionPlan | null> {
        const sql = 'SELECT * FROM subscription_plans WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
            if (rows.length > 0) {
                // Sử dụng một hàm parse đơn giản hơn vì không có pricings ở đây
                const row = rows[0];
                return {
                    id: row.id,
                    site_id: row.site_id, // Thêm site_id từ database
                    name: row.name,
                    description: row.description,
                    max_concurrent_jobs: row.max_concurrent_jobs,
                    options: row.options ? JSON.parse(row.options) : undefined,
                };
            }
            return null;
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi tìm gói bằng ID ${id}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Lấy tất cả các gói dịch vụ theo site_id.
     */
    public static async findAll({ limit, offset, siteId }: { limit?: number; offset?: number, siteId?: number }): Promise<ISubscriptionPlan[]> {
        let sql = 'SELECT * FROM subscription_plans';
        const params: any[] = [];
        
        if (siteId) {
            sql += ' WHERE site_id = ?';
            params.push(siteId);
        }
        
        sql += ' ORDER BY id ASC';
        
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, params);
            return rows.map(this.parsePlan);
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi lấy tất cả gói: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tất cả các gói subscription cùng với các gói giá theo site_id.
     */
    public static async findAllWithPricingBySite(siteId: number): Promise<ISubscriptionPlan[]> {
        const sql = `
            SELECT
                sp.id,
                sp.site_id,
                sp.name,
                sp.description,
                sp.max_concurrent_jobs,
                sp.options,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', pp.id,
                        'name', pp.name,
                        'price', pp.price,
                        'currency', pp.currency,
                        'duration_days', pp.duration_days
                    )
                ) as pricings
            FROM
                subscription_plans sp
            LEFT JOIN
                pricing_plans pp ON sp.id = pp.plan_id
            WHERE
                sp.site_id = ?
                AND pp.status = 'active'
                AND (pp.start_date IS NULL OR pp.start_date <= NOW())
                AND (pp.end_date IS NULL OR pp.end_date >= NOW())
            GROUP BY
                sp.id
            ORDER BY
                sp.id ASC
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [siteId]);
            return rows.map(this.parsePlan);
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi lấy tất cả gói kèm giá theo site: ${error.message}`);
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
            (name, description, max_concurrent_jobs, options, site_id) 
            VALUES (?, ?, ?, ?, ?)
        `;
        // Chuyển 'options' thành chuỗi JSON trước khi lưu
        const optionsString = data.options ? JSON.stringify(data.options) : null;

        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.name,
                data.description,
                data.max_concurrent_jobs,
                optionsString,
                data.site_id // Thay đổi từ user_id thành site_id
            ]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi tạo gói mới: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cập nhật một gói dịch vụ đã có (với site_id check).
     * @param id - ID của gói cần cập nhật.
     * @param siteId - Site ID để đảm bảo quyền sở hữu.
     * @param data - Dữ liệu cần cập nhật.
     * @returns `true` nếu cập nhật thành công, `false` nếu không.
     */
    public static async update(id: number, siteId: number, data: Partial<PlanData>): Promise<boolean> {
        // Xử lý 'options' nếu nó được cung cấp trong dữ liệu cập nhật
        if (data.options) {
            data.options = JSON.stringify(data.options);
        }

        const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
        const values = Object.values(data);

        const sql = `UPDATE subscription_plans SET ${fields} WHERE id = ? AND site_id = ?`;

        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [...values, id, siteId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi cập nhật gói ID ${id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa một gói dịch vụ (với site_id check).
     * @param id - ID của gói cần xóa.
     * @param siteId - Site ID để đảm bảo quyền sở hữu.
     * @returns `true` nếu xóa thành công, `false` nếu không.
     */
    public static async delete(id: number, siteId: number): Promise<boolean> {
        const sql = 'DELETE FROM subscription_plans WHERE id = ? AND site_id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [id, siteId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi xóa gói ID ${id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm gói dịch vụ theo ID và site_id để đảm bảo quyền sở hữu.
     */
    public static async findByIdAndSite(id: number, siteId: number): Promise<ISubscriptionPlan | null> {
        const sql = 'SELECT * FROM subscription_plans WHERE id = ? AND site_id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id, siteId]);
            if (rows.length > 0) {
                const row = rows[0];
                return {
                    id: row.id,
                    site_id: row.site_id,
                    name: row.name,
                    description: row.description,
                    max_concurrent_jobs: row.max_concurrent_jobs,
                    options: row.options ? JSON.parse(row.options) : undefined,
                };
            }
            return null;
        } catch (error) {
            Log.error(`[SubscriptionPlanModel] Lỗi khi tìm gói bằng ID ${id} và site ${siteId}: ${error.message}`);
            throw error;
        }
    }
}

export default SubscriptionPlan;
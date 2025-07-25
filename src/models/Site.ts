import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

// Interface cho cấu trúc của một Site object
export interface ISite {
    id: number;
    domain: string;
    user_id: number; // User sở hữu site này
    configs?: any; // Lưu trữ các cấu hình dưới dạng JSON
    created_at?: Date;
    status?: string;
}

class Site {
    /**
     * Tìm một site bằng ID của nó.
     */
    public static async findById(siteId: number): Promise<ISite | null> {
        const sql = 'SELECT * FROM sites WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [siteId]);
            if (rows.length > 0) {
                const site = rows[0] as ISite;
                // Parse configs nếu nó là một chuỗi JSON
                if (site.configs && typeof site.configs === 'string') {
                    site.configs = JSON.parse(site.configs);
                }
                return site;
            }
            return null;
        } catch (error) {
            Log.error(`Lỗi khi tìm site bằng ID ${siteId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Kiểm tra xem một user có phải là admin (chủ sở hữu) của site hay không.
     */
    public static async isSiteAdmin(siteId: number, userId: number): Promise<boolean> {
        const sql = 'SELECT id FROM sites WHERE id = ? AND user_id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [siteId, userId]);
            return rows.length > 0;
        } catch (error) {
            Log.error(`Lỗi khi kiểm tra admin của site ${siteId} cho user ${userId}: ${error.message}`);
            // Mặc định trả về false nếu có lỗi để đảm bảo an toàn
            return false;
        }
    }

    /**
     * Kiểm tra xem một user có phải là admin (chủ sở hữu) của site hay không,
     * dựa trên DOMAIN của site.
     */
    public static async isUserAdminOfSiteByDomain(domain: string, userId: number): Promise<boolean> {
        const sql = 'SELECT id FROM sites WHERE domain = ? AND user_id = ? LIMIT 1';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [domain, userId]);
            return rows.length > 0;
        } catch (error) {
            Log.error(`Lỗi khi kiểm tra admin của domain ${domain} cho user ${userId}: ${error.message}`);
            return false;
        }
    }
}

export default Site;
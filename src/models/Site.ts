import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

//interface site cònig
export interface SiteConfig {
    // White label options
    brand_name?: string; // Tên thương hiệu hiển thị
    logo_url?: string; // URL logo
    favicon_url?: string; // URL favicon
    primary_color?: string; // Màu chủ đạo
    secondary_color?: string; // Màu phụ
    support_email?: string; // Email hỗ trợ khách hàng
    custom_domain?: string; // Domain riêng cho site

    // Payment information
    payment_provider?: 'stripe' | 'paypal' | 'momo' | 'vnpay' | string; // Nhà cung cấp thanh toán
    payment_api_key?: string; // API key cho thanh toán
    payment_secret?: string; // Secret key cho thanh toán
    billing_address?: string; // Địa chỉ thanh toán
    tax_id?: string; // Mã số thuế
    currency?: string; // Đơn vị tiền tệ (VD: USD, VND)

    // Setup/installation info
    language?: string; // Ngôn ngữ của site
    timezone?: string; // Múi giờ của site
    theme?: string; // Tên theme đang sử dụng
    custom_css?: string; // CSS tùy chỉnh cho site
    custom_js?: string; // JS tùy chỉnh cho site
    enable_signup?: boolean; // Cho phép đăng ký tài khoản mới
    enable_social_login?: boolean; // Cho phép đăng nhập qua mạng xã hội
    maintenance_mode?: boolean; // Bật chế độ bảo trì
    maintenance_message?: string; // Thông báo hiển thị khi ở chế độ bảo trì
    enable_captcha?: boolean; // Bật CAPTCHA cho đăng ký/đăng nhập
    captcha_site_key?: string; // Site key cho CAPTCHA
    captcha_secret_key?: string; // Secret key cho CAPTCHA
    enable_analytics?: boolean; // Bật Google Analytics hoặc công cụ phân tích khác
    analytics_tracking_id?: string; // ID theo dõi Google Analytics
    enable_notifications?: boolean; // Bật thông báo cho người dùng
    notification_email?: string; // Email nhận thông báo

    // Other extensible options
    [key: string]: any;
}
// Interface cho cấu trúc của một Site object
export interface ISite {
    id: number;
    domain: string;
    user_id: number; // User sở hữu site này
    configs?: SiteConfig; // Lưu trữ các cấu hình dưới dạng JSON
    created_at?: Date;
    status?: 'active' | 'inactive' | 'suspended';
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

    //get siteId by domain

    public static async findByDomain(domain: string | null): Promise<ISite | null> {
        // Nếu domain là null, get hostname hiện tại
        if (!domain) {
            domain = 'localhost'; // Thay thế bằng logic lấy hostname hiện tại
        }
        const sql = 'SELECT * FROM sites WHERE domain = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [domain]);
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
            Log.error(`Lỗi khi tìm site bằng domain ${domain}: ${error.message}`);
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

    /**
     * Cập nhật một phần hoặc toàn bộ cấu hình cho một site cụ thể.
     * Hàm này sẽ đọc cấu hình hiện tại, hợp nhất với cấu hình mới,
     * và lưu lại kết quả. Chỉ những trường có trong `newConfigs` mới bị ghi đè.
     *
     * @param siteId ID của trang web cần cập nhật.
     * @param newConfigs Một object chứa các trường cấu hình mới cần cập nhật hoặc thêm vào.
     * @returns Trả về `true` nếu cập nhật thành công.
     */
    public static async updateConfigs(siteId: number, newConfigs: object): Promise<boolean> {
        // Nếu object rỗng, không làm gì cả để tránh truy vấn thừa
        if (Object.keys(newConfigs).length === 0) {
            return true;
        }

        const connection = await Database.pool.getConnection();
        try {
            // Bắt đầu một transaction để đảm bảo an toàn dữ liệu
            await connection.beginTransaction();

            // 1. Lấy cấu hình hiện tại từ database và khóa hàng đó lại để tránh race condition
            const [rows] = await connection.query<mysql.RowDataPacket[]>(
                'SELECT configs FROM sites WHERE id = ? FOR UPDATE',
                [siteId]
            );

            if (rows.length === 0) {
                await connection.rollback();
                Log.warn(`[Site.updateConfigs] Không tìm thấy site với ID: ${siteId}`);
                return false; // Không tìm thấy site
            }

            // 2. Phân giải chuỗi JSON hiện tại thành object
            let currentConfigs = {};
            if (rows[0].configs && typeof rows[0].configs === 'string') {
                try {
                    currentConfigs = JSON.parse(rows[0].configs);
                } catch (e) {
                    Log.error(`Lỗi JSON trong configs của site ID ${siteId}. Sẽ ghi đè.`);
                }
            } else if (typeof rows[0].configs === 'object' && rows[0].configs !== null) {
                currentConfigs = rows[0].configs;
            }

            // 3. Hợp nhất cấu hình cũ với cấu hình mới
            // Các trường trong `newConfigs` sẽ ghi đè lên các trường trùng tên trong `currentConfigs`
            const mergedConfigs = { ...currentConfigs, ...newConfigs };

            // 4. Chuyển đổi object đã hợp nhất thành chuỗi JSON và cập nhật lại database
            const updatedConfigsString = JSON.stringify(mergedConfigs);
            const sql = 'UPDATE sites SET configs = ? WHERE id = ?';
            const [result] = await connection.execute<mysql.ResultSetHeader>(sql, [updatedConfigsString, siteId]);

            // Lưu thay đổi
            await connection.commit();

            return result.affectedRows > 0;
        } catch (error) {
            // Nếu có lỗi, hoàn tác tất cả thay đổi
            await connection.rollback();
            Log.error(`Lỗi khi cập nhật configs cho site ID ${siteId}: ${error.stack}`);
            throw error; // Ném lỗi ra để controller có thể xử lý
        } finally {
            // Luôn trả connection về pool sau khi dùng xong
            connection.release();
        }
    }
}

export default Site;
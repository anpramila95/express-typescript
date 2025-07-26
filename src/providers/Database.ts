/**
 * Define Database connection for MySQL with retry mechanism
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com> - Adapted for MySQL
 */

import * as mysql from 'mysql2/promise';

import Locals from './Locals';
import Log from '../middlewares/Log';

export class Database {
    // Biến static để giữ connection pool
    public static pool: mysql.Pool;

    /**
     * Hàm tiện ích để tạm dừng thực thi.
     * @param ms Thời gian chờ (tính bằng mili giây)
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Khởi tạo connection pool với cơ chế thử lại.
     */
    public static async init(): Promise<void> {
        const maxRetries = 5; // Số lần thử lại tối đa
        const retryDelay = 3000; // Thời gian chờ giữa các lần thử (3 giây)
        const mysqlConfig = Locals.config().mysqlConfig;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Tạo pool kết nối
                this.pool = mysql.createPool({
                    host: mysqlConfig.host,
                    user: mysqlConfig.user,
                    password: mysqlConfig.password,
                    database: mysqlConfig.database,
                    port: mysqlConfig.port,
                    waitForConnections: true,
                    connectionLimit: 10,
                    queueLimit: 0
                });

                // Kiểm tra kết nối bằng cách lấy một connection từ pool
                const connection = await this.pool.getConnection();
                connection.release(); // Trả connection về pool ngay sau khi kiểm tra
 
                Log.info(`✔ Connected to MySQL server at: ${mysqlConfig.host}`);
                return; // Kết nối thành công, thoát khỏi hàm

            } catch (error) {
                Log.error(`❌ Attempt ${attempt} failed to connect to MySQL: ${error.message}`);

                if (attempt < maxRetries) {
                    Log.info(`Retrying in ${retryDelay / 1000} seconds...`);
                    await this.sleep(retryDelay); // Chờ trước khi thử lại
                } else {
                    Log.error('❌ All attempts to connect to the MySQL server have failed. Application will terminate.');
                    // Ném lỗi cuối cùng để dừng ứng dụng
                    throw error;
                }
            }
        }
    }
}

export default Database;
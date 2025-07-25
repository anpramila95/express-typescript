/**
 * Define Database connection for MySQL
 *
 * @author Faiz A. Farooqui <faiz@geekyants.com> - Adapted for MySQL
 */

import * as mysql from 'mysql2/promise';

import Locals from './Locals';
import Log from '../middlewares/Log';

export class Database {
    // Biến static để giữ connection pool
    public static pool: mysql.Pool;

    // Khởi tạo connection pool
    public static init(): void {
        try {
            const mysqlConfig = Locals.config().mysqlConfig;

            // Tạo pool kết nối
            this.pool = mysql.createPool({
                host: mysqlConfig.host,
                user: mysqlConfig.user,
                password: mysqlConfig.password,
                database: mysqlConfig.database,
                port: mysqlConfig.port,
                waitForConnections: true,
                connectionLimit: 10, // Giới hạn số kết nối đồng thời
                queueLimit: 0
            });

            Log.info(`✔ Connected to MySQL server at: ${mysqlConfig.host}`);

        } catch (error) {
            Log.error('❌ Failed to connect to the MySQL server!!');
            throw error;
        }
    }
}

export default Database;
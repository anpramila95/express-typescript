/**
 * Define User model for MySQL
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com> - Refactored for MySQL
 */

import * as bcrypt from 'bcrypt';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

import Database from '../providers/Database';
import { IUser } from '../interfaces/models/user';
import Log from '../middlewares/Log';
import { ISite } from './Site'; // Import ISite interface


export class User implements IUser {

    public id: number;
    public email: string;
    public password: string;
    public fullname: string;
    public gender: string;
    public geolocation: string;
    public website: string;
    public picture: string;
    public passwordResetToken?: string;
    public passwordResetExpires?: Date;
    public last_login?: Date;
    public facebook?: string;
    public twitter?: string;
    public isAdmin: boolean = false; // Default to false, can be set laters
    public google?: string;
    public github?: string;
    public tokens: any[]; // Note: Storing tokens in a TEXT/JSON column is needed
    public affiliate_id: number | null; // Required affiliate ID to match IUser
    public site_id: number; // Required site ID
    public knownIPs?: string[]; // Optional, can be added later if needed
    public two_fa_secret?: string;
    public two_fa_enabled?: boolean;
    public instagram: string;
    public linkedin: string;
    public steam: string;

    constructor(user: any) {
        this.id = user.id;
        this.email = user.email || '';
        this.password = user.password || '';
        this.fullname = user.fullname || '';
        this.gender = user.gender || '';
        this.geolocation = user.geolocation || '';
        this.website = user.website || '';
        this.picture = user.picture || '';
        this.passwordResetToken = user.passwordResetToken || '';
        this.passwordResetExpires = user.passwordResetExpires || new Date();
        this.facebook = user.facebook || '';
        this.twitter = user.twitter || '';
        this.google = user.google || '';
        this.github = user.github || '';
        // Assuming tokens are stored as a JSON string in the database
        this.tokens = typeof user.tokens === 'string' ? JSON.parse(user.tokens) : user.tokens || [];
        this.isAdmin = user.isAdmin || false; // Default to false if not set
        this.last_login = user.last_login || new Date();
        this.affiliate_id = user.affiliate_id ?? null; // Ensure affiliate_id is always present
        this.site_id = user.site_id;
        this.knownIPs = user.knownIPs || [];
        this.two_fa_enabled = user.two_fa_enabled || false;
        this.two_fa_secret = user.two_fa_secret || null;
    }


    /**
    FOR ADMIN SITE */
    //find all by site_id, can filter and seaching
    public static async findAllBySiteId(siteId: number, filter: string = '', page: number = 1, limit: number = 10): Promise<{ users: User[], total: number }> {
        const offset = (page - 1) * limit;
        const sql = `
            SELECT * FROM users
            WHERE site_id = ? AND (email LIKE ? OR fullname LIKE ?)
            LIMIT ? OFFSET ?
        `;
        try {
            //cehck has filter
            if (!filter) {
                filter = ''; // Default to empty string if no filter provided
            }
            filter = filter.trim(); // Trim whitespace from the filter

            const [rows] = await Database.pool.query<RowDataPacket[]>(sql, [
                siteId,
                `%${filter}%`,
                `%${filter}%`,
                limit,
                offset
            ]);
            const users = rows.map(row => new User(row));

            // Lấy tổng số người dùng để phân trang
            const countSql = 'SELECT COUNT(*) as total FROM users WHERE site_id = ? AND (email LIKE ? OR fullname LIKE ?)';
            const [countRows] = await Database.pool.query<RowDataPacket[]>(countSql, [siteId, `%${filter}%`, `%${filter}%`]);
            const total = countRows[0].total;

            return { users, total };
        } catch (error) {
            Log.error(`Error finding users by site ID: ${error.message}`);
            throw error;
        }
    }

    /**
     * Finds a user by its id
     */
    public static async findById(id: number, site_id?: number): Promise<User | null> {
        let sql = 'SELECT * FROM users WHERE id = ?';
        const params: (string | number)[] = [id];
        if (site_id !== undefined) {
            sql += ' AND site_id = ?';
            params.push(site_id);
        }
        try {
            const [rows] = await Database.pool.query<RowDataPacket[]>(sql, params);
            if (rows.length > 0) {
                return new User(rows[0]);
            }
            return null;
        } catch (error) {
            Log.error(`Error finding user by id: ${error.message}`);
            return null;
        }
    }

    /**
     * Finds a user by its email
     */
    public static async findOne({ email, site_id = null, passwordResetToken = null, passwordResetExpires = null }: { email: string, site_id?: number | null, passwordResetToken?: string | null, passwordResetExpires?: Date | string | null }): Promise<User | null> {
        // Bắt đầu với câu lệnh SQL cơ bản
        let sql = 'SELECT * FROM users WHERE email = ?';
        const params: (string | number | Date | null)[] = [email];

        // Thêm điều kiện cho site_id một cách linh hoạt
        if (site_id !== null) {
            sql += ' AND site_id = ?';
            params.push(site_id);
        } else {
            sql += ' AND site_id IS NULL';
        }

        // Thêm điều kiện cho passwordResetToken một cách linh hoạt
        if (passwordResetToken !== null) {
            sql += ' AND passwordResetToken = ?';
            params.push(passwordResetToken);
        }


        try {
            const [rows] = await Database.pool.query<RowDataPacket[]>(sql, params);
            if (rows.length > 0) {
                return new User(rows[0]);
            }
            return null;
        } catch (error) {
            Log.error(`Error finding user by email: ${error.message}`);
            return null;
        }
    }

    //findBy passwordResetToken and passwordResetExpires
    public static async findByPasswordResetToken(token: string): Promise<User | null> {
        const sql = 'SELECT * FROM users WHERE passwordResetToken = ? AND passwordResetExpires > NOW()';
        try {
            const [rows] = await Database.pool.query<RowDataPacket[]>(sql, [token]);
            if (rows.length > 0) {
                return new User(rows[0]);
            }
            return null;
        } catch (error) {
            Log.error(`Error finding user by password reset token: ${error.message}`);
            return null;
        }
    }

    /**
     * Tạo một người dùng mới trong một Site, với mật khẩu đã được băm.
     * @param userData Dữ liệu người dùng mới
     * @returns ID của người dùng vừa được tạo
     */
    public static async create(userData: Omit<IUser, 'id'>): Promise<{ id: number }> {
        // Băm mật khẩu trước khi lưu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(userData.password, salt);

        const sql = `
            INSERT INTO users (site_id, fullname, email, password)
            VALUES (?, ?, ?, ?)
        `;

        try {
            const [result] = await Database.pool.execute<ResultSetHeader>(sql, [
                userData.site_id,
                userData.fullname,
                userData.email,
                hashedPassword // <-- Lưu mật khẩu đã băm
            ]);
            return { id: result.insertId };
        } catch (error) {
            // Xử lý lỗi nếu email đã tồn tại
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('user.email_already_used');
            }
            Log.error(`[UserModel] Lỗi khi tạo người dùng: ${error}`);
            throw error;
        }
    }


    /**
     * Creates a new user
     */
    public async save(): Promise<User> {
        
        // Hash password if it exists and has been modified
        if (this.password) {
            const salt = await bcrypt.genSalt(10);
            this.password = await bcrypt.hash(this.password, salt);
        }

        const sql = `
            INSERT INTO users (email, password, fullname, gender, geolocation, website, picture, google, twitter, tokens, affiliate_id, site_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                fullname = VALUES(fullname),
                gender = VALUES(gender),
                geolocation = VALUES(geolocation),
                website = VALUES(website),
                picture = VALUES(picture),
                google = VALUES(google),
                twitter = VALUES(twitter),
                tokens = VALUES(tokens),
                affiliate_id = VALUES(affiliate_id),
                site_id = VALUES(site_id)
        `;

        const params = [
            this.email, this.password, this.fullname, this.gender, this.geolocation,
            this.website, this.picture, this.google, this.twitter, JSON.stringify(this.tokens),
            this.affiliate_id, this.site_id
        ];

        try {
            const [result] = await Database.pool.execute<ResultSetHeader>(sql, params);
            if (result.insertId) {
                this.id = result.insertId;
            }
            // Remove password from the returned object
            this.password = undefined;
            return this;
        } catch (error) {
            Log.error(`Error saving user: ${error.message}`);
            throw error;
        }
    }


    /**
     * Cập nhật thông tin người dùng
     */

    public static async update(data: Partial<IUser>, userId: number): Promise<boolean | void> {
        // Chỉ cập nhật các trường có trong data
        const fields = [];
        const values = [];

        if (data.email) {
            fields.push('email = ?');
            values.push(data.email);
        }
        if (data.fullname) {
            fields.push('fullname = ?');
            values.push(data.fullname);
        }
        if (data.gender) {
            fields.push('gender = ?');
            values.push(data.gender);
        }
        if (data.geolocation) {
            fields.push('geolocation = ?');
            values.push(data.geolocation);
        }
        if (data.website) {
            fields.push('website = ?');
            values.push(data.website);
        }
        if (data.picture) {
            fields.push('picture = ?');
            values.push(data.picture);
        }
        if (data.google) {
            fields.push('google = ?');
            values.push(data.google);
        }
        if (data.twitter) {
            fields.push('twitter = ?');
            values.push(data.twitter);
        }
        if (data.tokens) {
            fields.push('tokens = ?');
            values.push(JSON.stringify(data.tokens));
        }
        if (data.affiliate_id) {
            fields.push('affiliate_id = ?');
            values.push(data.affiliate_id);
        }
        if (data.site_id) {
            fields.push('site_id = ?');
            values.push(data.site_id);
        }
        if (data.password) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(data.password, salt);
            fields.push('password = ?');
            values.push(hashedPassword);
        }
        if (fields.length === 0) {
            throw new Error('user.no_fields_to_update');
        }
        values.push(userId); // Thêm ID người dùng vào cuối để cập nhật
        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
        try {
            await Database.pool.execute(sql, values);
            return true;
        } catch (error) {
            Log.error(`Error updating user: ${error.message}`);
            throw error;
        }
    }

    /**
     * Compare password
     */
    public async comparePassword(password: string): Promise<boolean> {
        if (!this.password) {
            return false;
        }
        return bcrypt.compare(password, this.password);
    }

    //update last login
    public static async updateLastLogin(userId: number): Promise<void> {
        const sql = 'UPDATE users SET last_login = NOW() WHERE id = ?';
        try {
            await Database.pool.execute(sql, [userId]);

        } catch (error) {
            Log.error(`Error updating last login for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    //change password
    public static async changePassword(newPassword: string, userId: number): Promise<void> {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const sql = 'UPDATE users SET password = ? WHERE id = ?';
        try {
            await Database.pool.execute(sql, [hashedPassword, userId]);
        } catch (error) {
            Log.error(`Error changing password for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa người dùng theo ID
     */
    public static async deleteById(id: number): Promise<void> {
        const sql = 'DELETE FROM users WHERE id = ?';
        try {
            const [result] = await Database.pool.execute<ResultSetHeader>(sql, [id]);
            if (result.affectedRows === 0) {
                throw new Error('user.user_not_found_by_id');
            }
        } catch (error) {
            Log.error(`Error deleting user by id: ${error.message}`);
            throw error;
        }
    }


    public static async userIdBelongsToSite(userId: number, site: ISite): Promise<boolean> {
        const sql = 'SELECT COUNT(*) as count FROM users WHERE id = ? AND site_id = ?';
        try {
            const [rows] = await Database.pool.query<RowDataPacket[]>(sql, [userId, site.id]);
            return rows[0].count > 0;
        } catch (error) {
            Log.error(`Error checking if user ID ${userId} belongs to site ID ${site.id}: ${error.message}`);
            throw error;
        }
    }

    // Trong class User
    public async isNewIP(ip: string): Promise<boolean> {
        if (!this.knownIPs || !this.knownIPs.includes(ip)) {
            if (!this.knownIPs) {
                this.knownIPs = [];
            }
            this.knownIPs.push(ip);
            await this.save();
            return true;
        }
        return false;
    }

    /**
     * Lấy tất cả các quyền (permissions) của một người dùng dựa trên các vai trò (roles) được gán.
     * @param userId ID của người dùng cần kiểm tra.
     * @returns Một mảng các chuỗi (string) chứa tên của các quyền. Ví dụ: ['users.invite', 'transactions.view']
     */
    public static async getPermissions(userId: number): Promise<string[]> {
        const sql = `
            SELECT DISTINCT p.name
            FROM permissions p
            INNER JOIN role_permissions rp ON p.id = rp.permission_id
            INNER JOIN user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = ?
        `;

        try {
            const [rows] = await Database.pool.query<RowDataPacket[]>(sql, [userId]);

            // rows sẽ là một mảng các object, ví dụ: [{ name: 'users.invite' }, { name: 'transactions.view' }]
            // Chúng ta cần chuyển nó thành một mảng các chuỗi: ['users.invite', 'transactions.view']
            const permissions = rows.map(row => row.name);

            return permissions;
        } catch (error) {
            Log.error(`[UserModel] Lỗi khi lấy quyền cho người dùng ${userId}: ${error}`);
            // Ném lỗi ra ngoài để middleware có thể bắt và xử lý
            throw new Error('user.cannot_get_permissions');
        }
    }

    /**
    * Gán một vai trò cho một người dùng. 
    * Xóa các vai trò cũ trước khi gán vai trò mới để đảm bảo mỗi user chỉ có 1 role.
    */
    public static async assignRole(userId: number, roleId: number, siteId: number): Promise<boolean> {
        const connection = await Database.pool.getConnection();
        try {
            await connection.beginTransaction();

            // Xóa tất cả các vai trò hiện tại của user trong site này
            const deleteSql = `
                DELETE ur FROM user_roles ur
                INNER JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id = ? AND r.site_id = ?
            `;
            await connection.execute(deleteSql, [userId, siteId]);

            // Gán vai trò mới
            const insertSql = 'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)';
            const [result] = await connection.execute<ResultSetHeader>(insertSql, [userId, roleId]);

            await connection.commit();
            return result.affectedRows > 0;
        } catch (error) {
            await connection.rollback();
            Log.error(`[UserModel] Lỗi khi gán vai trò cho người dùng: ${error}`);
            throw error;
        } finally {
            connection.release();
        }
    }

    //updateData
    public static async updateData(userId: number, data: Partial<IUser>): Promise<boolean> {
        // Dynamically build SET clause and values
        const fields = Object.keys(data);
        if (fields.length === 0) {
            throw new Error('user.no_fields_to_update');
        }
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => (field === 'tokens' && Array.isArray(data[field]) ? JSON.stringify(data[field]) : data[field]));
        values.push(userId);

        const sql = `UPDATE users SET ${setClause} WHERE id = ?`;
        try {
            const [result] = await Database.pool.execute<ResultSetHeader>(sql, values);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[UserModel] Error updating user: ${error}`);
            throw error;
        }
    }


}

export default User;
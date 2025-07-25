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


export class User implements IUser {
    public id: number;
    public email: string;
    public password: string;
    public fullname: string;
    public gender: string;
    public geolocation: string;
    public website: string;
    public picture: string;
    public passwordResetToken: string;
    public passwordResetExpires: Date;
    public last_login?: Date;
    public facebook: string;
    public twitter: string;
    public isAdmin: boolean = false; // Default to false, can be set laters
    public google: string;
    public github: string;
    public tokens: any[]; // Note: Storing tokens in a TEXT/JSON column is needed
    public affiliate_id: number | null; // Required affiliate ID to match IUser
    public site_id: number; // Required site ID


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
    }
    public instagram: string;
    public linkedin: string;
    public steam: string;


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
    public static async findById(id: number): Promise<User | null> {
        const sql = 'SELECT * FROM users WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<RowDataPacket[]>(sql, [id]);
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
    public static async findOne({ email, site_id = null }: { email: string, site_id?: number | null }): Promise<User | null> {
        // Bắt đầu với câu lệnh SQL cơ bản
        let sql = 'SELECT * FROM users WHERE email = ?';
        const params: (string | number)[] = [email];

        // Thêm điều kiện cho site_id một cách linh hoạt
        if (site_id !== null) {
            sql += ' AND site_id = ?';
            params.push(site_id);
        } else {
            sql += ' AND site_id IS NULL';
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
            INSERT INTO users (email, password, fullname, gender, geolocation, website, picture, google, twitter, tokens)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                fullname = VALUES(fullname),
                gender = VALUES(gender),
                geolocation = VALUES(geolocation),
                website = VALUES(website),
                picture = VALUES(picture),
                google = VALUES(google),
                twitter = VALUES(twitter),
                tokens = VALUES(tokens)
        `;
        const params = [
            this.email, this.password, this.fullname, this.gender, this.geolocation,
            this.website, this.picture, this.google, this.twitter, JSON.stringify(this.tokens)
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

    /**ffindOn
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
}

export default User;
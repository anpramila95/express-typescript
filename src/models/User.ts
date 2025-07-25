/**
 * Define User model for MySQL
 *
 * @author Faiz A. Farooqui <faiz@geekyants.com> - Refactored for MySQL
 */

import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
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
    public facebook: string;
    public twitter: string;
    public google: string;
    public github: string;
    public tokens: any[]; // Note: Storing tokens in a TEXT/JSON column is needed

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
    }
    public instagram: string;
    public linkedin: string;
    steam: string;

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
    public static async findOne({ email }: { email: string }): Promise<User | null> {
        const sql = 'SELECT * FROM users WHERE email = ?';
        try {
            const [rows] = await Database.pool.query<RowDataPacket[]>(sql, [email]);
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

    /**
     * Compare password
     */
    public async comparePassword(password: string): Promise<boolean> {
        if (!this.password) {
            return false;
        }
        return bcrypt.compare(password, this.password);
    }
}

export default User;
/**
 * Defines the Media model for MySQL
 *
 * @author Your Name <you@example.com>
 */

import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

// Interface for the structure of a Media object
export interface IMedia {
    id?: number;
    user_id: number;
    kol_id?: number;
    url?: string;
    thumbnail_url?: string;
    filePath?: string;
    size?: number;
    name?: string;
    type: string; // e.g., 'image', 'video', 'gen-ai', 'instant-video'
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'upload-waiting';
    meta?: any; // To store JSON data
    created_at?: Date;
}

export class Media {
    /**
     * Finds a media item by its ID.
     */
    public static async findById(id: number): Promise<IMedia | null> {
        const sql = 'SELECT * FROM medias WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
            if (rows.length > 0) {
                const media = rows[0] as IMedia;
                // Parse meta if it's a JSON string
                if (media.meta && typeof media.meta === 'string') {
                    media.meta = JSON.parse(media.meta);
                }
                return media;
            }
            return null;
        } catch (error) {
            Log.error(`Error finding media by ID: ${error.message}`);
            throw error;
        }
    }

    /**
     * Creates a new media record in the database.
     */
    public static async create(mediaData: Omit<IMedia, 'id' | 'created_at'>): Promise<number> {
        const sql = `
            INSERT INTO medias (user_id, kol_id, url, thumbnail_url, filePath, size, name, type, status, meta)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        // Ensure meta is a JSON string
        const metaString = (mediaData.meta && typeof mediaData.meta === 'object')
            ? JSON.stringify(mediaData.meta)
            : mediaData.meta;

        const params = [
            mediaData.user_id,
            mediaData.kol_id || null,
            mediaData.url || null,
            mediaData.thumbnail_url || null,
            mediaData.filePath || null,
            mediaData.size || 0,
            mediaData.name || null,
            mediaData.type,
            mediaData.status,
            metaString || null
        ];

        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, params);
            return result.insertId;
        } catch (error) {
            Log.error(`Error creating media: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Fetches all media with pagination and filtering.
     */
    public static async findAll(args: {
        userId: number;
        limit?: number;
        offset?: number;
        keyword?: string;
        type?: string;
        status?: string;
    }): Promise<{ items: IMedia[], total: number }> {
        const { userId, limit = 60, offset = 0, keyword, type, status } = args;

        let whereClauses = ['user_id = ?'];
        let params: any[] = [userId];

        if (keyword) {
            whereClauses.push('name LIKE ?');
            params.push(`%${keyword}%`);
        }
        if (type) {
            const types = type.split(',');
            whereClauses.push(`type IN (${types.map(() => '?').join(',')})`);
            params.push(...types);
        }
        if (status) {
            whereClauses.push('status = ?');
            params.push(status);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Query for items
        const itemsSql = `SELECT * FROM medias ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        const [items] = await Database.pool.query<mysql.RowDataPacket[]>(itemsSql, [...params, limit, offset]);
        
        // Query for total count
        const countSql = `SELECT COUNT(*) as total FROM medias ${whereSql}`;
        const [countRows] = await Database.pool.query<mysql.RowDataPacket[]>(countSql, params);
        
        return {
            items: items as IMedia[],
            total: countRows[0].total
        };
    }



    /**
     * Đếm số lượng job đang hoạt động (chờ xử lý hoặc đang xử lý) của người dùng.
     * @param userId - ID của người dùng
     * @param jobTypePrefix - Tiền tố của loại job (ví dụ: 'gen-')
     * @returns Số lượng job đang hoạt động
     */
    public static async countActiveJobsByUser(userId: number, jobTypePrefix: string): Promise<number> {
        const sql = `
            SELECT COUNT(*) as activeJobCount 
            FROM medias 
            WHERE 
                user_id = ? AND 
                (status = 'processing' OR status = 'pending') AND
                type LIKE ?
        `;
        const likePattern = `${jobTypePrefix}%`; // Pattern để tìm các type bắt đầu bằng 'gen-'

        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId, likePattern]);
            return rows[0].activeJobCount || 0;
        } catch (error) {
            Log.error(`[MediaModel] Error counting active jobs for user ${userId}: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Deletes a media item by its ID.
     */
    public static async delete(id: number): Promise<boolean> {
        const sql = 'DELETE FROM medias WHERE id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`Error deleting media: ${error.message}`);
            throw error;
        }
    }
    
     /**
     * Checks if a user is the owner of a media item.
     */
    public static async isOwner(mediaId: number, userId: number): Promise<boolean> {
        const sql = 'SELECT id FROM medias WHERE id = ? AND user_id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [mediaId, userId]);
            return rows.length > 0;
        } catch (error) {
            Log.error(`Error checking media ownership: ${error.message}`);
            throw error;
        }
    }
}

export default Media;
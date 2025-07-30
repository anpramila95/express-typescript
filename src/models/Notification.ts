import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

// Định nghĩa cấu trúc của một object Notification
export interface INotification {
    id: number;
    user_id: number;
    type: string;
    title: string;
    message: string;
    is_read: boolean;
    created_at: Date;
}

class Notification {
    /**
     * Lấy danh sách thông báo của một người dùng, có phân trang
     */
    public static async findByUserId(userId: number, options: { limit: number, offset: number, unreadOnly?: boolean }): Promise<{ notifications: INotification[], total: number }> {
        let countSql = 'SELECT COUNT(*) as total FROM notifications WHERE user_id = ?';
        let querySql = 'SELECT * FROM notifications WHERE user_id = ?';
        
        const params: (string | number | boolean)[] = [userId];
        const countParams: (string | number | boolean)[] = [userId];

        if (options.unreadOnly) {
            const unreadCondition = ' AND is_read = false';
            countSql += unreadCondition;
            querySql += unreadCondition;
        }

        querySql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(options.limit, options.offset);

        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(querySql, params);
            const [countRows] = await Database.pool.query<mysql.RowDataPacket[]>(countSql, countParams);
            
            return {
                notifications: rows as INotification[],
                total: countRows[0].total
            };
        } catch (error) {
            Log.error(`[NotificationModel] Error finding notifications for user ${userId}: ${error}`);
            throw error;
        }
    }

    /**
     * Tạo một thông báo mới
     */
    public static async create(data: Omit<INotification, 'id' | 'is_read' | 'created_at'>): Promise<{ success: boolean, insertId: number }> {
        const sql = 'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.user_id,
                data.type,
                data.title,
                data.message
            ]);
            return { success: result.affectedRows > 0, insertId: result.insertId };
        } catch (error) {
            Log.error(`[NotificationModel] Error creating notification: ${error}`);
            throw error;
        }
    }

    /**
     * Đánh dấu một thông báo là đã đọc
     */
    public static async markAsRead(notificationId: number, userId: number): Promise<boolean> {
        const sql = 'UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [notificationId, userId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[NotificationModel] Error marking as read: ${error}`);
            throw error;
        }
    }

    /**
     * Đánh dấu tất cả thông báo của user là đã đọc
     */
    public static async markAllAsRead(userId: number): Promise<number> {
        const sql = 'UPDATE notifications SET is_read = true WHERE user_id = ? AND is_read = false';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [userId]);
            return result.affectedRows;
        } catch (error) {
            Log.error(`[NotificationModel] Error marking all as read: ${error}`);
            throw error;
        }
    }
}

export default Notification;
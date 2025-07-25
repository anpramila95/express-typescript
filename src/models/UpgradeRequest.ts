import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

export interface IUpgradeRequest {
    id: number;
    user_id: number;
    plan_id: number;
    status: 'pending' | 'approved' | 'rejected';
    admin_notes?: string;
    created_at: Date;
    updated_at: Date;
}

class UpgradeRequest {
    /**
     * Creates a new upgrade request and returns the inserted ID.
     */
    public static async create(data: { user_id: number; plan_id: number }): Promise<{ id: number }> {
        const sql = 'INSERT INTO upgrade_requests (user_id, plan_id) VALUES (?, ?)';
        
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [data.user_id, data.plan_id]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[UpgradeRequestModel] Error creating request: ${error.message}`);
            throw new Error(`Database error: ${error.message}`);
        }
    }

    /**
     * Finds any pending upgrade request for a specific user.
     */
    public static async findPendingRequest(userId: number): Promise<IUpgradeRequest | null> {
        const sql = 'SELECT * FROM upgrade_requests WHERE user_id = ? AND status = "pending" LIMIT 1';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
            return rows.length > 0 ? (rows[0] as IUpgradeRequest) : null;
        } catch (error) {
            Log.error(`[UpgradeRequestModel] Error finding pending request for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Finds an upgrade request by its ID.
     */
    public static async findById(id: number | string): Promise<IUpgradeRequest | null> {
        const sql = 'SELECT * FROM upgrade_requests WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
            return rows.length > 0 ? (rows[0] as IUpgradeRequest) : null;
        } catch (error) {
            Log.error(`[UpgradeRequestModel] Error finding request by ID ${id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Finds all upgrade requests with a specific status.
     */
    public static async findAllByStatus(status: 'pending' | 'approved' | 'rejected'): Promise<IUpgradeRequest[]> {
        const sql = 'SELECT * FROM upgrade_requests WHERE status = ? ORDER BY created_at DESC';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [status]);
            return rows as IUpgradeRequest[];
        } catch (error) {
            Log.error(`[UpgradeRequestModel] Error finding requests by status ${status}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Updates the status and notes of an upgrade request (for admin use).
     */
    public static async updateStatus(id: number | string, status: 'approved' | 'rejected', adminNotes: string): Promise<boolean> {
        const sql = 'UPDATE upgrade_requests SET status = ?, admin_notes = ? WHERE id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [status, adminNotes, id]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[UpgradeRequestModel] Error updating status for request ID ${id}: ${error.message}`);
            throw error;
        }
    }
}

export default UpgradeRequest;
import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

export interface IPurchaseRequest {
    id: number;
    user_id: number;
    package_id: number;
    credits_to_add: number;
    status: 'pending' | 'approved' | 'rejected';
    admin_notes?: string;
    created_at: Date;
    updated_at: Date;
}

class PurchaseRequest {
    /**
     * Creates a new purchase request and returns the inserted ID.
     */
    public static async create(data: { user_id: number; package_id: number; credits_to_add: number }): Promise<{ id: number }> {
        const sql = 'INSERT INTO purchase_requests (user_id, package_id, credits_to_add) VALUES (?, ?, ?)';
        
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [data.user_id, data.package_id, data.credits_to_add]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[PurchaseRequestModel] Error creating request: ${error.message}`);
            throw new Error(`Database error: ${error.message}`);
        }
    }

    /**
     * Finds a purchase request by its ID.
     */
    public static async findById(id: number | string): Promise<IPurchaseRequest | null> {
        const sql = 'SELECT * FROM purchase_requests WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
            return rows.length > 0 ? (rows[0] as IPurchaseRequest) : null;
        } catch (error) {
            Log.error(`[PurchaseRequestModel] Error finding request by ID ${id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Finds all purchase requests with a specific status.
     */
    public static async findAllByStatus(status: 'pending' | 'approved' | 'rejected'): Promise<IPurchaseRequest[]> {
        const sql = 'SELECT * FROM purchase_requests WHERE status = ? ORDER BY created_at DESC';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [status]);
            return rows as IPurchaseRequest[];
        } catch (error) {
            Log.error(`[PurchaseRequestModel] Error finding requests by status ${status}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Updates the status and notes of a purchase request (for admin use).
     */
    public static async updateStatus(id: number | string, status: 'approved' | 'rejected', adminNotes: string): Promise<boolean> {
        const sql = 'UPDATE purchase_requests SET status = ?, admin_notes = ? WHERE id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [status, adminNotes, id]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[PurchaseRequestModel] Error updating status for request ID ${id}: ${error.message}`);
            throw error;
        }
    }
}

export default PurchaseRequest;
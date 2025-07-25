/**
 * Model để quản lý credit của người dùng với nhiều loại và ngày hết hạn.
 */
import Database from '../providers/Database';
import Log from '../middlewares/Log';
import Locals from '../providers/Locals';
import type * as mysql from 'mysql2';

export interface IUserCreditEntry {
    id: number;
    user_id: number;
    credits: number;
    type: 'purchased' | 'promotional' | 'subscription';
    expires_at?: Date;
}

// Định nghĩa cấu trúc credit mặc định từ config (giữ nguyên)
interface IDefaultCredits {
    image: number;
    video: number;
    tts: number;
    'image-to-video': number;
}

class UserCredit {
    
    // --- CÁC HÀM CẤU HÌNH (GIỮ NGUYÊN) ---
    private static getDefaultCredits(): IDefaultCredits {
        const config = Locals.config();
        return {
            image: config.creditCosts?.image || 1,
            video: config.creditCosts?.video || 5,
            tts: config.creditCosts?.tts || 1,
            'image-to-video': config.creditCosts?.imageToVideo || 3
        };
    }

    public static getRequiredCreditsFor(type: string): number {
        const defaultCredits = this.getDefaultCredits();
        return defaultCredits[type] || 1;
    }
    
    // --- CÁC HÀM TRUY VẤN MỚI ---

    /**
     * Lấy tất cả các lô credit còn hiệu lực của người dùng.
     */
    private static async getActiveCreditBuckets(userId: number, connection?: mysql.PoolConnection): Promise<IUserCreditEntry[]> {
        const sql = `
            SELECT * FROM user_credits 
            WHERE user_id = ? AND credits > 0 AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY expires_at ASC, type DESC
        `;
        // Ưu tiên trừ: credit sắp hết hạn trước, sau đó đến credit khuyến mãi, credit gói, và cuối cùng là credit mua.
        
        const db = connection || Database.pool;
        const [rows] = await db.query<mysql.RowDataPacket[]>(sql, [userId]);
        return rows as IUserCreditEntry[];
    }

    /**
     * Lấy tổng số credit còn hiệu lực của người dùng.
     */
    public static async getTotalBalance(userId: number): Promise<number> {
        const sql = `
            SELECT SUM(credits) as total
            FROM user_credits 
            WHERE user_id = ? AND credits > 0 AND (expires_at IS NULL OR expires_at > NOW())
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
            const total = rows.length > 0 ? (rows[0].total || 0) : 0;
            //to number
            return Number(total);
        } catch (error) {
            Log.error(`[UserCreditModel] Lỗi khi lấy tổng credit cho user ${userId}: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Lấy tổng số credit theo từng loại cụ thể.
     */
    public static async getBalanceByType(userId: number, type: IUserCreditEntry['type']): Promise<number> {
        const sql = `
            SELECT SUM(credits) as total
            FROM user_credits 
            WHERE user_id = ? AND type = ? AND credits > 0 AND (expires_at IS NULL OR expires_at > NOW())
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId, type]);
            return rows.length > 0 ? (rows[0].total || 0) : 0;
        } catch (error) {
            Log.error(`[UserCreditModel] Lỗi khi lấy credit loại ${type} cho user ${userId}: ${error.message}`);
            throw error;
        }
    }
    
    // --- CÁC HÀM HÀNH ĐỘNG ĐÃ TỐI ƯU ---

    /**
     * Kiểm tra xem người dùng có đủ credit hay không.
     */
    public static async hasEnough(userId: number, amountToDeduct: number): Promise<boolean> {
        const totalBalance = await this.getTotalBalance(userId);
        return totalBalance >= amountToDeduct;
    }

    /**
     * Cộng một lô credit mới cho người dùng.
     */
    public static async add(
        userId: number, 
        amount: number, 
        type: IUserCreditEntry['type'], 
        expiresInDays?: number,
        sourceTransactionId?: number
    ): Promise<boolean> {
        if (amount <= 0) return true;

        const sql = `
            INSERT INTO user_credits (user_id, credits, type, expires_at, source_transaction_id) 
            VALUES (?, ?, ?, ?, ?)
        `;
        const expires_at = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;
        
        try {
            await Database.pool.execute(sql, [userId, amount, type, expires_at, sourceTransactionId]);
            return true;
        } catch (error) {
            Log.error(`[UserCreditModel] Lỗi khi cộng credit cho user ${userId}: ${error.stack}`);
            throw error;
        }
    }

    /**
     * Trừ credit của người dùng, ưu tiên các gói sắp hết hạn trước.
     */
    public static async deduct(userId: number, amountToDeduct: number): Promise<boolean> {
        if (amountToDeduct <= 0) return true;

        const connection = await Database.pool.getConnection();
        await connection.beginTransaction();

        try {
            const buckets = await this.getActiveCreditBuckets(userId, connection);
            const totalBalance = buckets.reduce((sum, bucket) => sum + bucket.credits, 0);

            if (totalBalance < amountToDeduct) {
                await connection.rollback();
                return false;
            }

            let remainingToDeduct = amountToDeduct;

            for (const bucket of buckets) {
                if (remainingToDeduct <= 0) break;

                const amountFromThisBucket = Math.min(bucket.credits, remainingToDeduct);
                
                const newCreditAmount = bucket.credits - amountFromThisBucket;
                const updateSql = 'UPDATE user_credits SET credits = ? WHERE id = ?';
                await connection.execute(updateSql, [newCreditAmount, bucket.id]);

                remainingToDeduct -= amountFromThisBucket;
            }
            
            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            Log.error(`[UserCreditModel] Lỗi khi trừ credit cho user ${userId}: ${error.stack}`);
            throw error;
        } finally {
            connection.release();
        }
    }
}

export default UserCredit;
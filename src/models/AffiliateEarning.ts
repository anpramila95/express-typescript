import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

interface EarningData {
    userId: number;
    sourceUserId: number;
    sourceTransactionId: number;
    commissionAmount: number;
    commissionRate: number;
}

class AffiliateEarning {
    /**
     * Ghi lại một khoản hoa hồng mới vào database.
     */
    public static async create(data: EarningData): Promise<boolean> {
        const sql = `
            INSERT INTO affiliate_earnings 
            (user_id, source_user_id, source_transaction_id, commission_amount, commission_rate) 
            VALUES (?, ?, ?, ?, ?)
        `;
        try {
            await Database.pool.execute(sql, [
                data.userId,
                data.sourceUserId,
                data.sourceTransactionId,
                data.commissionAmount,
                data.commissionRate
            ]);
            return true;
        } catch (error) {
            Log.error(`[AffiliateEarningModel] Lỗi khi tạo bản ghi hoa hồng: ${error.message}`);
            throw error;
        }
    }
}

export default AffiliateEarning;
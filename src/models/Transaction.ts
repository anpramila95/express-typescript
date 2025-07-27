import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';
import { ISubscriptionPlan } from './SubscriptionPlan';
import { IPricingPlan } from './PricingPlan'; // Import IPricingPlan
import { ICreditPackage } from './CreditPackage';
import DiscountCode, {IDiscountCode} from './DiscountCode'; // <-- Import


export interface ITransaction {
    id: number;
    user_id: number;
    site_id: number; // Thêm site_id để theo dõi transaction thuộc site nào
    type: 'subscription' | 'credit';
    description: string;
    amount: number;
    credits_change: number;
    plan_id?: number;
    package_id?: number;
    status: 'pending' | 'approved' | 'rejected';
    admin_notes?: string;
    created_at: Date;
    updated_at: Date;
    meta?: any; // Thông tin bổ sung, có thể là JSON
     // ... các trường hiện có
    payment_gateway?: 'stripe' | 'paypal' | 'crypto' | 'bank_transfer'; // Cổng thanh toán
    gateway_transaction_id?: string; // ID giao dịch từ cổng thanh toán
    
    // Thêm các trường cần thiết khác nếu có
    
}

export interface ITransactionWithPayment extends ITransaction {
    meta: any;
    paymentDetails?: {
        bankInfo: {
            bankName: string;
            accountName: string;
            accountNumber: string;
        };
        transferContent: string;
        qrCodeString: string;
    };
}

class Transaction {
    private static readonly bankInfo = {
        bankName: 'MB Bank',
        accountName: 'NGUYEN VAN A',
        accountNumber: '0123456789',
        bankBin: '970422'
    };

    private static generateVietQRString(amount: number, content: string): string {
        const { bankBin, accountNumber } = this.bankInfo;
        return `https://img.vietqr.io/image/${bankBin}-${accountNumber}-print.png?amount=${amount}&addInfo=${encodeURIComponent(content)}`;
    }

    public static async findByIdWithPaymentDetails(id: number | string): Promise<ITransactionWithPayment | null> {
        const sql = 'SELECT * FROM transactions WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
            if (rows.length === 0) return null;

            const row = rows[0];
            const transaction: ITransactionWithPayment = {
                ...(row as ITransaction),
                meta: row.meta ? JSON.parse(row.meta) : {},
            };

            if (transaction.status === 'pending' && transaction.amount > 0) {
                const transferContent = `TT ${transaction.id}`;
                transaction.paymentDetails = {
                    bankInfo: this.bankInfo,
                    transferContent: transferContent,
                    qrCodeString: this.generateVietQRString(transaction.amount, transferContent)
                };
            }
            return transaction;
        } catch (error) {
            Log.error(`[TransactionModel] Lỗi khi tìm giao dịch ID ${id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tạo một yêu cầu nâng cấp gói trong bảng transactions.
     * @param userId ID của người dùng.
     * @param plan Thông tin gói dịch vụ (để lấy plan_id).
     * @param pricingPlan Thông tin gói giá đã chọn (để lấy giá, tiền tệ, và thời hạn).
     */
    /**
     * Tạo yêu cầu nâng cấp gói, có thể có giảm giá.
     */
    public static async createSubscriptionRequest(
        userId: number,
        siteId: number, // Thêm site_id parameter
        pricingPlan: IPricingPlan,
        discountInfo?: { code: IDiscountCode; finalAmount: number }
    ): Promise<{ id: number }> {

        const originalAmount = pricingPlan.price;
        const finalAmount = discountInfo ? discountInfo.finalAmount : originalAmount;

        const description = `Yêu cầu nâng cấp gói: ${pricingPlan.name}`;
        
        const meta = {
            pricing_id: pricingPlan.id,
            duration_days: pricingPlan.duration_days,
            original_amount: originalAmount,
            final_amount: finalAmount,
            discount_code: discountInfo ? discountInfo.code.code : null,
        };

        const sql = `
            INSERT INTO transactions (user_id, site_id, type, description, amount, plan_id, status, meta)
            VALUES (?, ?, 'subscription', ?, ?, ?, 'pending', ?)
        `;

        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                userId,
                siteId, // Thêm site_id vào query
                description,
                finalAmount, // <-- Lưu giá cuối cùng vào cột amount
                pricingPlan.plan_id,
                JSON.stringify(meta) // <-- Lưu chi tiết vào meta
            ]);

            // Nếu có giảm giá, tăng lượt sử dụng
            if (discountInfo) {
                await DiscountCode.incrementUses(discountInfo.code.id);
            }

            return { id: result.insertId };
        } catch (error) {
            Log.error(`[TransactionModel] Lỗi khi tạo yêu cầu subscription: ${error.message}`);
            throw error;
        }
    }


    /**
     * Tạo một yêu cầu giao dịch để mua gói credit, có thể có giảm giá.
     * @param userId - ID của người dùng thực hiện.
     * @param creditPackage - Toàn bộ object của gói credit được mua.
     * @param discountInfo - (Tùy chọn) Thông tin giảm giá đã được xác thực.
     */
    public static async createCreditPurchaseRequest(
        userId: number,
        siteId: number, // Thêm site_id parameter
        creditPackage: ICreditPackage, // Giả sử model của bạn là CreditPackage
        discountInfo?: { code: IDiscountCode; finalAmount: number }
    ): Promise<{ id: number }> {

        const originalAmount = creditPackage.price;
        const finalAmount = discountInfo ? discountInfo.finalAmount : originalAmount;
        const creditsAmount = creditPackage.credits_amount; // Giả sử gói có trường 'credits_amount'

        const description = `Yêu cầu mua gói: ${creditsAmount} credits`;

        const meta = {
            package_id: creditPackage.id,
            credits_amount: creditsAmount,
            original_amount: originalAmount,
            final_amount: finalAmount,
            discount_code: discountInfo ? discountInfo.code.code : null,
        };

        const sql = `
            INSERT INTO transactions (user_id, site_id, type, description, amount, credits_change, status, meta)
            VALUES (?, ?, 'credit', ?, ?, ?, 'pending', ?)
        `;

        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                userId,
                siteId, // Thêm site_id vào query
                description,
                finalAmount,      // Giá cuối cùng
                creditsAmount,    // Số credit sẽ nhận được
                JSON.stringify(meta)
            ]);

            // Tăng lượt sử dụng mã nếu có
            if (discountInfo) {
                await DiscountCode.incrementUses(discountInfo.code.id);
            }

            return { id: result.insertId };
        } catch (error) {
            Log.error(`[TransactionModel] Lỗi khi tạo yêu cầu mua credit: ${error.message}`);
            throw error;
        }
    }


    public static async createCreditRequest(userId: number, siteId: number, pkg: ICreditPackage): Promise<{ id: number }> {
        const sql = `
            INSERT INTO transactions (user_id, site_id, type, description, amount, credits_change, package_id, status) 
            VALUES (?, ?, 'credit', ?, ?, ?, ?, 'pending')
        `;
        const description = `Yêu cầu mua gói: ${pkg.name}`;
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [userId, siteId, description, pkg.price, pkg.credits_amount, pkg.id]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[TransactionModel] Lỗi khi tạo yêu cầu mua credit: ${error.message}`);
            throw error;
        }
    }

    public static async findAllPending(siteId?: number): Promise<ITransaction[]> {
        let sql = 'SELECT * FROM transactions WHERE status = "pending"';
        const params: any[] = [];
        
        if (siteId) {
            sql += ' AND site_id = ?';
            params.push(siteId);
        }
        
        sql += ' ORDER BY created_at ASC';
        
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, params);
        return rows as ITransaction[];
    }

    public static async findAll(userId: number, siteId?: number): Promise<ITransaction[]> {
        let sql = 'SELECT * FROM transactions WHERE user_id = ?';
        const params: any[] = [userId];
        
        if (siteId) {
            sql += ' AND site_id = ?';
            params.push(siteId);
        }
        
        sql += ' ORDER BY created_at DESC';
        
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, params);
        return rows as ITransaction[];
    }


    public static async findById(id: number | string): Promise<ITransaction | null> {
        const sql = 'SELECT * FROM transactions WHERE id = ?';
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
        return rows.length > 0 ? (rows[0] as ITransaction) : null;
    }

    public static async updateStatus(id: number | string, status: 'approved' | 'rejected', adminNotes?: string): Promise<boolean> {
        const sql = 'UPDATE transactions SET status = ?, admin_notes = ? WHERE id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [status, adminNotes, id]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[TransactionModel] Lỗi khi cập nhật trạng thái cho giao dịch ID ${id}: ${error.message}`);
            throw error;
        }
    }

    //createCompleted
    /**
     * Tạo một bản ghi giao dịch đã hoàn thành ngay lập tức.
     * Dùng cho các hành động của admin như gán gói trực tiếp.
     * @param data - Dữ liệu cần thiết để tạo giao dịch.
     */
    public static async createCompleted(data: {
        user_id: number;
        site_id: number; // Thêm site_id là required
        type: 'subscription' | 'credit';
        status: 'approved' | 'completed'; // Thường là 'approved'
        description: string;
        amount: number;
        plan_id?: number;
        credits_change?: number;
        meta?: string;
        notes?: string;
    }): Promise<{ id: number }> {
        const sql = `
            INSERT INTO transactions (
                user_id, site_id, type, status, description, amount, plan_id,
                credits_change, meta, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.user_id,
                data.site_id, // Thêm site_id vào query
                data.type,
                data.status,
                data.description,
                data.amount,
                data.plan_id || null,
                data.credits_change || null,
                data.meta || null,
                data.notes || null
            ]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[TransactionModel] Lỗi khi tạo giao dịch đã hoàn thành: ${error.message}`);
            throw error;
        }
    }
}

export default Transaction;
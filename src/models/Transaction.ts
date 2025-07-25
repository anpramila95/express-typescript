import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';
import { ISubscriptionPlan } from './SubscriptionPlan';
import { ICreditPackage } from './CreditPackage';

export interface ITransaction {
    id: number;
    user_id: number;
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
}

export interface ITransactionWithPayment extends ITransaction {
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

            const transaction: ITransactionWithPayment = rows[0] as ITransaction;

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

    public static async createSubscriptionRequest(userId: number, plan: ISubscriptionPlan): Promise<{ id: number }> {
        const sql = `
            INSERT INTO transactions (user_id, type, description, amount, plan_id, status) 
            VALUES (?, 'subscription', ?, ?, ?, 'pending')
        `;
        const description = `Yêu cầu nâng cấp gói: ${plan.name}`;
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [userId, description, plan.price, plan.id]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[TransactionModel] Lỗi khi tạo yêu cầu subscription: ${error.message}`);
            throw error;
        }
    }

    public static async createCreditRequest(userId: number, pkg: ICreditPackage): Promise<{ id: number }> {
        const sql = `
            INSERT INTO transactions (user_id, type, description, amount, credits_change, package_id, status) 
            VALUES (?, 'credit', ?, ?, ?, ?, 'pending')
        `;
        const description = `Yêu cầu mua gói: ${pkg.name}`;
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [userId, description, pkg.price, pkg.credits_amount, pkg.id]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[TransactionModel] Lỗi khi tạo yêu cầu mua credit: ${error.message}`);
            throw error;
        }
    }

    public static async findAllPending(): Promise<ITransaction[]> {
        const sql = 'SELECT * FROM transactions WHERE status = "pending" ORDER BY created_at ASC';
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql);
        return rows as ITransaction[];
    }

    public static async findAll(userId: number): Promise<ITransaction[]> {
        const sql = 'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC';
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
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
}

export default Transaction;
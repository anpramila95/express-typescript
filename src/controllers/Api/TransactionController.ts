import { Request, Response } from 'express';
import Transaction from '../../models/Transaction';

interface AuthenticatedUser { id: number; isAdmin?: boolean; }

class TransactionController {
    public static async getDetails(req: Request, res: Response): Promise<Response> {
        const { transactionId } = req.params;
        const user = req.user as unknown as AuthenticatedUser;

        const transaction = await Transaction.findByIdWithPaymentDetails(transactionId);

        if (!transaction) return res.status(404).json({ error: req.__('transaction.not_found') });

        // Admin hoặc chủ sở hữu mới được xem
        if (transaction.user_id !== user.id && !user.isAdmin) {
            return res.status(403).json({ error: req.__('transaction.no_permission') });
        }

        return res.json({
            message: req.__('transaction.details'),
            transaction
        });
    }

    public static async findAll(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        if (!user) {
            return res.status(401).json({ error: req.__('transaction.login_required') });
        }
        try {
            const transactions = await Transaction.findAll(user.id);
            return res.json({
                transactions
            });
        } catch (error) {
            return res.status(500).json({ error: req.__('transaction.list_error') });
        }
    }
}

export default TransactionController;
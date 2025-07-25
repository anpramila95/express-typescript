import { Request, Response } from 'express';
import Transaction from '../../models/Transaction';

interface AuthenticatedUser { id: number; isAdmin?: boolean; }

class TransactionController {
    public static async getDetails(req: Request, res: Response): Promise<Response> {
        const { transactionId } = req.params;
        const user = req.user as unknown as AuthenticatedUser;

        const transaction = await Transaction.findByIdWithPaymentDetails(transactionId);

        if (!transaction) return res.status(404).json({ error: 'Không tìm thấy giao dịch.' });

        // Admin hoặc chủ sở hữu mới được xem
        if (transaction.user_id !== user.id && !user.isAdmin) {
            return res.status(403).json({ error: 'Bạn không có quyền xem giao dịch này.' });
        }

        return res.json({
            message: 'Chi tiết giao dịch',
            transaction
        });
    }

    public static async findAll(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        if (!user) {
            return res.status(401).json({ error: 'Bạn cần đăng nhập để xem giao dịch.' });
        }
        try {
            const transactions = await Transaction.findAll(user.id);
            return res.json({
                transactions
            });
        } catch (error) {
            return res.status(500).json({ error: 'Lỗi khi lấy danh sách giao dịch.' });
        }
    }
}

export default TransactionController;
// src/controllers/Api/PaymentController.ts
import { Request, Response } from 'express';
import PaymentService from '../../services/payment/PaymentService';
import Transaction from '../../models/Transaction';
import CreditPackage from '../../models/CreditPackage';
import SubscriptionPlan from '../../models/SubscriptionPlan';
import PayPalService from '../../services/payment/PayPalService';
import Locals from '../../providers/Locals';
interface AuthenticatedUser { id: number; }

class PaymentController {
    public static async createCheckoutSession(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { transactionId, paymentMethod } = req.body;

        if (!transactionId || !paymentMethod) {
            return res.status(400).json({ error: 'Vui lòng cung cấp đủ thông tin giao dịch và phương thức thanh toán.' });
        }

        const transaction = await Transaction.findById(transactionId);
        if (!transaction || transaction.user_id !== user.id || transaction.status !== 'pending') {
            return res.status(404).json({ error: 'Giao dịch không hợp lệ.' });
        }

        try {
            const session = await PaymentService.createSession(transaction, paymentMethod);
            return res.json({ session });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }


     // Hàm xử lý khi PayPal thanh toán thành công
    public static async handlePaypalSuccess(req: Request, res: Response): Promise<void> {
        const { paymentId, PayerID } = req.query;
        try {
            const payment = await PayPalService.executePayment(paymentId as string, PayerID as string);
            const customData = JSON.parse(payment.transactions[0].custom);
            const transactionId = customData.transaction_id;
            
            // Xử lý logic sau thanh toán
            await Transaction.updateStatus(transactionId, 'approved', 'Thanh toán thành công qua PayPal');
            // Cộng credit, kích hoạt gói...
            
            res.redirect(`${Locals.config().url}/payment/success`);
        } catch (error) {
            console.error(error);
            res.redirect(`${Locals.config().url}/payment/cancel`);
        }
    }

    // Hàm xử lý khi người dùng hủy thanh toán PayPal
    public static handlePaypalCancel(req: Request, res: Response): void {
        res.redirect(`${Locals.config().url}/payment/cancel`);
    }
}

export default PaymentController;
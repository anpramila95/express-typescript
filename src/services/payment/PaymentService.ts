// src/services/payment/PaymentService.ts
import { ITransaction } from '../../models/Transaction';
import StripeService from './StripeService';
import PayPalService from './PayPalService';
// import CryptoService from './CryptoService';

class PaymentService {
    public static async createSession(transaction: ITransaction, method: 'stripe' | 'paypal' | 'crypto') {
        switch (method) {
            case 'stripe':
                // Stripe trả về { url: string }
                const { url } = await StripeService.createCheckoutSession(transaction);
                return { paymentUrl: url };
            case 'paypal':
                // PayPal trả về { approvalUrl: string }
                const { approvalUrl } = await PayPalService.createOrder(transaction);
                return { paymentUrl: approvalUrl };
            // case 'crypto':
            //      // Coinbase trả về { chargeUrl: string }
            //     const { chargeUrl } = await CryptoService.createCharge(transaction);
            //     return { paymentUrl: chargeUrl };
            default:
                throw new Error('Phương thức thanh toán không được hỗ trợ.');
        }
    }
}

export default PaymentService;
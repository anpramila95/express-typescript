// src/controllers/Api/WebhookController.ts
import { Request, Response } from 'express';
import Stripe from 'stripe';
import Locals from '../../providers/Locals';
import Transaction from '../../models/Transaction';
// ... import các service xử lý sau khi thanh toán thành công

const stripe = new Stripe(Locals.config().stripeSecretKey);

class WebhookController {
    public static async handleStripe(req: Request, res: Response): Promise<Response> {
        const sig = req.headers['stripe-signature'];
        let event;

        try {
            event = stripe.webhooks.constructEvent(req.body, sig, Locals.config().stripeWebhookSecret);
        } catch (err) {
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            const transactionId = session.metadata.transaction_id;

            // Lấy transaction từ DB
            const transaction = await Transaction.findById(transactionId);
            if (transaction && transaction.status === 'pending') {
                // TODO: Xử lý logic sau khi thanh toán thành công
                // Ví dụ: cập nhật trạng thái transaction, cộng credit, nâng cấp gói...
                await Transaction.updateStatus(transactionId, 'approved', 'Thanh toán thành công qua Stripe');
                // Gọi các service tương ứng...
            }
        }

        return res.json({ received: true });
    }


    // Xử lý webhook từ Coinbase
    public static async handleCoinbase(req: Request, res: Response): Promise<Response> {
        const rawBody = req.body; // Giả sử đã có raw body
        const signature = req.headers['x-cc-webhook-signature'] as string;
        const webhookSecret = Locals.config().coinbaseWebhookSecret;

        try {
            const event = Webhook.verifyEventBody(rawBody, signature, webhookSecret);
            
            if (event.type === 'charge:confirmed') {
                const transactionId = event.data.metadata.transaction_id;
                
                const transaction = await Transaction.findById(transactionId);
                if (transaction && transaction.status === 'pending') {
                    // Cập nhật trạng thái
                    await Transaction.updateStatus(transactionId, 'approved', 'Thanh toán thành công qua Coinbase');
                    // Cộng credit, kích hoạt gói...
                }
            }
            
            return res.status(200).send('Webhook processed successfully.');
        } catch (error) {
            console.error('Coinbase Webhook Error:', error);
            return res.status(400).send('Webhook Error: Could not verify payload');
        }
    }
    
    // PayPal thường không dùng webhook theo cách này, mà dựa vào IPN hoặc Redirect URL.
    // Nếu bạn muốn dùng webhook, bạn cần đăng ký trên PayPal và xử lý ở đây.
    // Dưới đây là một ví dụ giả định.
    public static async handlePaypal(req: Request, res: Response): Promise<Response> {
        const body = req.body;
        // Logic xác thực webhook từ PayPal (rất phức tạp, cần post lại về PayPal để verify)
        console.log('PayPal Webhook Received:', body);

        if (body.event_type === 'PAYMENT.SALE.COMPLETED') {
            const sale = body.resource;
            const customData = JSON.parse(sale.custom);
            const transactionId = customData.transaction_id;

            const transaction = await Transaction.findById(transactionId);
            if (transaction && transaction.status === 'pending') {
                 await Transaction.updateStatus(transactionId, 'approved', 'Thanh toán thành công qua PayPal Webhook');
                 // Cộng credit, kích hoạt gói...
            }
        }
        
        return res.sendStatus(200);
    }
}

export default WebhookController;
// src/services/payment/StripeService.ts
import Stripe from 'stripe';
import { ITransaction } from '../../models/Transaction';
import Locals from '../../providers/Locals';

const stripe = new Stripe(Locals.config().stripeSecretKey, {
    apiVersion: "2025-06-30.basil"
});

class StripeService {
    public static async createCheckoutSession(transaction: ITransaction) {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd', // Hoặc currency từ transaction
                        product_data: {
                            name: transaction.description,
                        },
                        unit_amount: transaction.amount * 100, // Stripe tính bằng cent
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${Locals.config().url}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${Locals.config().url}/payment/cancel`,
            metadata: {
                transaction_id: transaction.id.toString(),
            }
        });

        return { sessionId: session.id, url: session.url };
    }
}

export default StripeService;
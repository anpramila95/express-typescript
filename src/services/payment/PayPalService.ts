// src/services/payment/PayPalService.ts
import paypal from 'paypal-rest-sdk';
import { ITransaction } from '../..//models/Transaction';
import Locals from '../../providers/Locals';

class PayPalService {
    constructor() {
        const config = Locals.config();
        paypal.configure({
            mode: config.paypalMode, // sandbox hoặc live
            client_id: config.paypalClientId,
            client_secret: config.paypalClientSecret,
        });
    }

    public createOrder(transaction: ITransaction): Promise<{ approvalUrl: string }> {
        return new Promise((resolve, reject) => {
            const create_payment_json = {
                intent: 'sale',
                payer: {
                    payment_method: 'paypal',
                },
                redirect_urls: {
                    return_url: `${Locals.config().url}/api/payment/paypal/success`,
                    cancel_url: `${Locals.config().url}/api/payment/paypal/cancel`,
                },
                transactions: [
                    {
                        item_list: {
                            items: [
                                {
                                    name: transaction.description,
                                    sku: transaction.id.toString(),
                                    price: transaction.amount.toFixed(2), // Giữ 2 chữ số thập phân
                                    currency: 'USD',
                                    quantity: 1,
                                },
                            ],
                        },
                        amount: {
                            currency: 'USD',
                            total: transaction.amount.toFixed(2),
                        },
                        description: transaction.description,
                        custom: JSON.stringify({ transaction_id: transaction.id })
                    },
                ],
            };

            paypal.payment.create(create_payment_json, (error, payment) => {
                if (error) {
                    console.error('PayPal Error:', error.response);
                    reject(new Error('Không thể tạo thanh toán PayPal.'));
                } else {
                    const approvalUrl = payment.links.find(link => link.rel === 'approval_url')?.href;
                    if (approvalUrl) {
                        resolve({ approvalUrl });
                    } else {
                        reject(new Error('Không tìm thấy URL phê duyệt của PayPal.'));
                    }
                }
            });
        });
    }

    public executePayment(paymentId: string, payerId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const execute_payment_json = {
                payer_id: payerId,
            };

            paypal.payment.execute(paymentId, execute_payment_json, (error, payment) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(payment);
                }
            });
        });
    }
}

export default new PayPalService();
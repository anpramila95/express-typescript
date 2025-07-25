import User from '../models/User';
import AffiliateEarning from '../models/AffiliateEarning';
import { ITransaction } from '../models/Transaction';
import Log from '../middlewares/Log';

class AffiliateService {
    // Tỷ lệ hoa hồng mặc định (5%)
    private static readonly DEFAULT_COMMISSION_RATE = 0.05;

    /**
     * Xử lý và ghi nhận hoa hồng khi một giao dịch gia hạn gói được duyệt.
     */
    public static async processSubscriptionCommission(transaction: ITransaction): Promise<void> {
        // Chỉ xử lý cho giao dịch gia hạn gói và có giá trị
        if (transaction.type !== 'subscription' || transaction.amount <= 0) {
            return;
        }

        try {
            // Tìm người dùng đã thanh toán để lấy ID người giới thiệu
            const payingUser = await User.findById(transaction.user_id);

            // Nếu người dùng này được giới thiệu bởi ai đó
            if (payingUser && payingUser.affiliate_id) {
                const affiliateId = payingUser.affiliate_id;
                const commissionRate = this.DEFAULT_COMMISSION_RATE;
                const commissionAmount = transaction.amount * commissionRate;

                // Ghi nhận hoa hồng cho người giới thiệu
                await AffiliateEarning.create({
                    userId: affiliateId,
                    sourceUserId: payingUser.id,
                    sourceTransactionId: transaction.id,
                    commissionAmount: commissionAmount,
                    commissionRate: commissionRate
                });

                Log.info(`Đã ghi nhận hoa hồng ${commissionAmount} cho user ID ${affiliateId} từ giao dịch ${transaction.id}.`);
                
                // TODO: Ở đây bạn có thể thêm logic để cộng tiền vào ví/số dư của người dùng affiliate nếu có.
            }
        } catch (error) {
            Log.error(`Lỗi khi xử lý hoa hồng cho giao dịch ${transaction.id}: ${error.stack}`);
        }
    }
}

export default AffiliateService;
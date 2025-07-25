import { Request, Response } from 'express';
import SubscriptionPlan from '../../models/SubscriptionPlan';
import Transaction from '../../models/Transaction';
import PricingPlan from '../../models/PricingPlan';
import DiscountCode, { IDiscountCode } from '../../models/DiscountCode'; // <-- Import
import Log from '../../middlewares/Log';

interface AuthenticatedUser {
    id: number;
}


class PlanController {
    /**
     * Lấy danh sách tất cả các gói dịch vụ và các tùy chọn giá của chúng.
     */
    public static async listPlans(req: Request, res: Response): Promise<Response> {
        try {
            const plans = await SubscriptionPlan.findAllWithPricing();
            return res.status(200).json(plans);
        } catch (error) {
            return res.status(500).json({ error: 'Không thể tải danh sách gói dịch vụ.' });
        }
    }

    public static async requestUpgrade(req: Request, res: Response): Promise<Response> {
        const user = req.user as AuthenticatedUser;
        // Lấy thêm redeemCode từ body
        const { pricingId, redeemCode } = req.body;

        if (!pricingId) {
            return res.status(400).json({ error: 'Vui lòng chọn một gói giá.' });
        }

        try {
            const pricingPlan = await PricingPlan.findById(Number(pricingId));
            if (!pricingPlan) {
                return res.status(404).json({ error: 'Gói giá không hợp lệ.' });
            }

            let discountInfo: { code: IDiscountCode; finalAmount: number } | undefined;

            // Nếu người dùng nhập mã giảm giá
            if (redeemCode) {
                const discountCode = await DiscountCode.findValidCode(redeemCode);
                if (!discountCode) {
                    return res.status(400).json({ error: 'Mã giảm giá không hợp lệ hoặc đã hết hạn.' });
                }

                const finalAmount = DiscountCode.calculateDiscountedAmount(pricingPlan.price, discountCode);
                discountInfo = { code: discountCode, finalAmount };
            }

            // Tạo yêu cầu giao dịch, truyền thông tin giảm giá vào (nếu có)
            await Transaction.createSubscriptionRequest(user.id, pricingPlan, discountInfo);

            return res.status(201).json({ message: 'Yêu cầu nâng cấp của bạn đã được gửi thành công.' });
        } catch (error) {
            Log.error(`Lỗi khi yêu cầu nâng cấp: ${error.stack}`);
            return res.status(500).json({ error: 'Đã xảy ra lỗi trong quá trình xử lý.' });
        }
    }
}

export default PlanController;
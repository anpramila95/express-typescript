import { Request, Response } from 'express';
import SubscriptionPlan from '../../models/SubscriptionPlan';
import Transaction from '../../models/Transaction';
import PricingPlan from '../../models/PricingPlan';
import DiscountCode, { IDiscountCode } from '../../models/DiscountCode'; // <-- Import
import Log from '../../middlewares/Log';
import Site, { ISite } from "../../models/Site"; // Dùng để lấy siteId từ hostname

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
            return res.status(500).json({ error: req.__('plan.cannot_load_plans') });
        }
    }

    public static async requestUpgrade(req: Request, res: Response): Promise<Response> {
        const user = req.user as AuthenticatedUser;
        // Lấy thêm redeemCode từ body
        const { pricingId, redeemCode } = req.body;
        
        if (!pricingId) {
            return res.status(400).json({ error: req.__('plan.select_pricing_plan') });
        }

        const site = req.site as ISite;
        if (!site) {
            return res.status(400).json({ error: req.__('plan.site_not_found') });
        }

        try {
            const pricingPlan = await PricingPlan.findByIdSiteId(Number(pricingId), site.id);

            if (!pricingPlan) {
                return res.status(404).json({ error: req.__('plan.invalid_pricing_plan') });
            }

            let discountInfo: { code: IDiscountCode; finalAmount: number } | undefined;

            // Nếu người dùng nhập mã giảm giá
            if (redeemCode) {
                const discountCode = await DiscountCode.findValidCode(redeemCode, site.id);
                if (!discountCode) {
                    return res.status(400).json({ error: req.__('plan.invalid_discount_code') });
                }

                const finalAmount = DiscountCode.calculateDiscountedAmount(pricingPlan.price, discountCode);
                discountInfo = { code: discountCode, finalAmount };
            }

            // Tạo yêu cầu giao dịch, truyền thông tin giảm giá vào (nếu có)
            await Transaction.createSubscriptionRequest(user.id, site.id,  pricingPlan, discountInfo);

            return res.status(201).json({ message: req.__('plan.upgrade_request_sent') });
        } catch (error) {
            Log.error(`Lỗi khi yêu cầu nâng cấp: ${error.stack}`);
            return res.status(500).json({ error: req.__('plan.processing_error') });
        }
    }
}

export default PlanController;
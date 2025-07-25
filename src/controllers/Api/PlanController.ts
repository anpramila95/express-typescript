import { Request, Response } from 'express';
import SubscriptionPlan from '../../models/SubscriptionPlan';
import Transaction from '../../models/Transaction'; // <-- Thay đổi

interface AuthenticatedUser { id: number; email: string; }

class PlanController {
    /**
     * Lấy danh sách các gói subscription để người dùng chọn.
     */
    public static async listPlans(req: Request, res: Response): Promise<Response> {
        const plans = await SubscriptionPlan.findAll();
        return res.json(plans);
    }

    /**
     * Người dùng gửi yêu cầu nâng cấp gói.
     */
    public static async requestUpgrade(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { planId } = req.body;

        if (!planId) {
            return res.status(400).json({ error: 'Vui lòng chọn một gói.' });
        }

        const plan = await SubscriptionPlan.findById(planId);
        if (!plan) {
            return res.status(404).json({ error: 'Gói dịch vụ không tồn tại.' });
        }

        await Transaction.createSubscriptionRequest(user.id, plan);

        return res.status(201).json({ message: 'Yêu cầu nâng cấp của bạn đã được gửi và đang chờ xét duyệt.' });
    }
}

export default PlanController;
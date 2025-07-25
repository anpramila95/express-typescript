import { Request, Response } from 'express';
// Import các model cần thiết
import UpgradeRequest from '../../models/UpgradeRequest'; // Bạn sẽ cần tạo model này
import SubscriptionPlan from '../../models/SubscriptionPlan'; // Bạn sẽ cần tạo model này

interface AuthenticatedUser { id: number; email: string; }

class PlanController {
    // Lấy danh sách các gói subscription
    public static async listPlans(req: Request, res: Response): Promise<Response> {
        const plans = await SubscriptionPlan.findAll(); // Lấy từ DB
        return res.json({
            message: 'Danh sách gói subscription đã được lấy thành công.',
            success: true,
            data: plans
        });
    }

    // Người dùng gửi yêu cầu nâng cấp gói
    public static async requestUpgrade(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { planId } = req.body;

        if (!planId) {
            return res.status(400).json({ error: 'Vui lòng chọn một gói.' });
        }

        // Tùy chọn: Kiểm tra xem người dùng có yêu cầu nào đang chờ không
        const existingRequest = await UpgradeRequest.findPendingRequest(user.id);
        if (existingRequest) {
            return res.status(409).json({ error: 'Bạn đã có một yêu cầu đang chờ xử lý.' });
        }

        await UpgradeRequest.create({ user_id: user.id, plan_id: planId });
        return res.status(201).json({ message: 'Yêu cầu của bạn đã được gửi đi và đang chờ xét duyệt.' });
    }
}
export default PlanController;
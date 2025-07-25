import { Request, Response } from 'express';
import UpgradeRequest from '../../../models/UpgradeRequest';
import PurchaseRequest from '../../../models/PurchaseRequest';
import UserCredit from '../../../models/UserCredit';
// import SubscriptionService from '../../../services/SubscriptionService';

class ApprovalController {
    // Lấy tất cả yêu cầu đang chờ duyệt
    public static async listPendingRequests(req: Request, res: Response): Promise<Response> {
        const upgradeRequests = await UpgradeRequest.findAll({ where: { status: 'pending' } });
        const purchaseRequests = await PurchaseRequest.findAll({ where: { status: 'pending' } });
        return res.json({ upgrades: upgradeRequests, purchases: purchaseRequests });
    }

    // Admin duyệt yêu cầu nâng cấp
    public static async approveUpgrade(req: Request, res: Response): Promise<Response> {
        const { requestId } = req.params;
        const { adminNotes } = req.body;

        const request = await UpgradeRequest.findById(requestId);
        if (!request || request.status !== 'pending') {
            return res.status(404).json({ error: 'Yêu cầu không hợp lệ hoặc đã được xử lý.' });
        }

        // TODO: Cập nhật gói subscription thực tế cho người dùng
        // await SubscriptionService.changeUserPlan(request.user_id, request.plan_id);

        // Cập nhật trạng thái yêu cầu
        await UpgradeRequest.update(requestId, { status: 'approved', admin_notes: adminNotes });

        return res.json({ message: `Đã duyệt yêu cầu nâng cấp cho người dùng ID ${request.user_id}.` });
    }

    // Admin duyệt yêu cầu mua credit
    public static async approvePurchase(req: Request, res: Response): Promise<Response> {
        const { requestId } = req.params;
        const { adminNotes } = req.body;

        const request = await PurchaseRequest.findById(requestId);
        if (!request || request.status !== 'pending') {
            return res.status(404).json({ error: 'Yêu cầu không hợp lệ hoặc đã được xử lý.' });
        }

        // Cộng credit cho người dùng
        await UserCredit.add(request.user_id, request.credits_to_add);
        
        // Cập nhật trạng thái yêu cầu
        await PurchaseRequest.update(requestId, { status: 'approved', admin_notes: adminNotes });
        
        return res.json({ message: `Đã duyệt và cộng ${request.credits_to_add} credit cho người dùng ID ${request.user_id}.` });
    }

    // Admin từ chối yêu cầu
    public static async rejectRequest(req: Request, res: Response): Promise<Response> {
        const { type, requestId } = req.params; // type: 'upgrade' or 'purchase'
        const { adminNotes } = req.body;

        if (!adminNotes) {
            return res.status(400).json({ error: 'Vui lòng cung cấp lý do từ chối.' });
        }

        if (type === 'upgrade') {
            await UpgradeRequest.update(requestId, { status: 'rejected', admin_notes: adminNotes });
        } else if (type === 'purchase') {
            await PurchaseRequest.update(requestId, { status: 'rejected', admin_notes: adminNotes });
        } else {
            return res.status(400).json({ error: 'Loại yêu cầu không hợp lệ.' });
        }

        return res.json({ message: 'Yêu cầu đã bị từ chối.' });
    }
}
export default ApprovalController;
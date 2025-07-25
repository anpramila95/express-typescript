import { Request, Response } from 'express';
// Import các model cần thiết

import PurchaseRequest from '../../models/PurchaseRequest';
import CreditPackage from '../../models/CreditPackage';

interface AuthenticatedUser { id: number; email: string; }

class CreditController {
    // Lấy danh sách các gói credit
    public static async listPackages(req: Request, res: Response): Promise<Response> {
        const packages = await CreditPackage.findAll();
        return res.json({
            message: 'Danh sách gói credit đã được lấy thành công.',
            success: true,
            data: packages
        });
    }

    // Người dùng gửi yêu cầu mua credit
    public static async requestPurchase(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { packageId } = req.body;

        if (!packageId) {
            return res.status(400).json({ error: 'Vui lòng chọn một gói credit.' });
        }

        // Lấy thông tin gói để biết số credit cần cộng
        const creditPackage = await CreditPackage.findById(packageId);
        if (!creditPackage) {
            return res.status(404).json({ error: 'Gói credit không tồn tại.' });
        }

        const { id: requestId } = await PurchaseRequest.create({
            user_id: user.id,
            package_id: packageId,
            credits_to_add: creditPackage.credits_amount 
        });
        //get id request
        return res.status(201).json({ message: 'Yêu cầu mua credit đã được gửi và đang chờ xét duyệt.', requestId });
    }
}
export default CreditController;
import { Request, Response } from 'express';
import CreditPackage from '../../models/CreditPackage';
import Transaction from '../../models/Transaction'; // <-- Thay đổi

interface AuthenticatedUser { id: number; email: string; }

class CreditController {
    /**
     * Lấy danh sách các gói credit để người dùng chọn.
     */
    public static async listPackages(req: Request, res: Response): Promise<Response> {
        const packages = await CreditPackage.findAll();
        return res.json(packages);
    }

    /**
     * Người dùng gửi yêu cầu mua credit.
     */
    public static async requestPurchase(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { packageId } = req.body;

        if (!packageId) {
            return res.status(400).json({ error: 'Vui lòng chọn một gói credit.' });
        }
        
        const creditPackage = await CreditPackage.findById(packageId);
        if (!creditPackage) {
            return res.status(404).json({ error: 'Gói credit không tồn tại.' });
        }

        await Transaction.createCreditRequest(user.id, creditPackage); // <-- Thay đổi

        return res.status(201).json({ message: 'Yêu cầu mua credit đã được gửi và đang chờ xét duyệt.' });
    }
}

export default CreditController;
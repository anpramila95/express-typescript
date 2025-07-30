import { Request, Response } from 'express';
import CreditPackage from '../../models/CreditPackage';
import Transaction from '../../models/Transaction'; // <-- Thay đổi
import Site, { ISite } from "../../models/Site"; // Dùng để lấy siteId từ hostname


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
            return res.status(400).json({ error: req.__('credit.select_package') });
        }

        const site = req.site as ISite;
        if (!site) {
            return res.status(400).json({ error: req.__('credit.site_not_found') });
        }


        const creditPackage = await CreditPackage.findById(packageId, site.id);
        if (!creditPackage) {
            return res.status(404).json({ error: req.__('credit.package_not_found') });
        }

        await Transaction.createCreditRequest(user.id, site.id, creditPackage); // <-- Thay đổi

        return res.status(201).json({ message: req.__('credit.request_sent') });
    }
}

export default CreditController;
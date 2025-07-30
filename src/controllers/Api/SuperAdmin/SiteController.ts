// src/controllers/Api/Admin/SiteController.ts

import { Request, Response } from 'express';
import SiteService from '../../../services/SiteService';
import Log from '../../../middlewares/Log';

class AdminSiteController {
    /**
     * Super Admin cập nhật các tính năng được phép cho một site
     */
    public static async updateFeatures(req: Request, res: Response): Promise<Response> {
        try {
            const { siteId } = req.params;
            const { featureCodes } = req.body;

            if (!featureCodes || !Array.isArray(featureCodes)) {
                return res.status(400).json({ error: req.__('super_admin.feature_codes_array') });
            }

            await SiteService.updateFeatures(Number(siteId), featureCodes);
            return res.status(200).json({ message: req.__('super_admin.update_features_success') });
        } catch (error) {
            Log.error(error.stack);
            return res.status(500).json({ error: req.__('super_admin.server_error') });
        }
    }

    /**
     * Super Admin lấy danh sách tất cả các site
     */
    public static async listSites(req: Request, res: Response): Promise<Response> {
        try {
            // Giả sử model Site của bạn sẽ có phương thức findAll()
            // Nếu chưa có, bạn có thể thêm nó vào model Site.ts
            // const sites = await Site.findAll();
            return res.status(200).json({ message: req.__('super_admin.function_needs_implementation') });
        } catch (error) {
            Log.error(error.stack);
            return res.status(500).json({ error: req.__('super_admin.server_error') });
        }
    }
}

export default AdminSiteController;
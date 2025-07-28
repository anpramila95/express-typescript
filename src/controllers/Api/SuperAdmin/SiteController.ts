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
                return res.status(400).json({ error: '`featureCodes` phải là một mảng.' });
            }

            await SiteService.updateFeatures(Number(siteId), featureCodes);
            return res.status(200).json({ message: 'Cập nhật tính năng cho site thành công.' });
        } catch (error) {
            Log.error(error.stack);
            return res.status(500).json({ error: 'Đã có lỗi xảy ra ở máy chủ.' });
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
            return res.status(200).json({ message: "Chức năng này cần được cài đặt trong model Site" });
        } catch (error) {
            Log.error(error.stack);
            return res.status(500).json({ error: 'Đã có lỗi xảy ra ở máy chủ.' });
        }
    }
}

export default AdminSiteController;
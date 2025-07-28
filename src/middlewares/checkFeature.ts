// src/middlewares/checkFeature.ts

import { Request, Response, NextFunction } from 'express';
import SiteService from '../services/SiteService';

export const checkFeature = (featureCode: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.site) {
            return res.status(500).json({ error: 'Lỗi hệ thống: Không thể xác định được site.' });
        }

        const siteId = req.site.id;
        const hasAccess = await SiteService.hasFeature(siteId, featureCode);

        if (hasAccess) {
            return next();
        }

        return res.status(403).json({
            error: 'Forbidden',
            message: 'Bạn không có quyền truy cập tính năng này.'
        });
    };
};
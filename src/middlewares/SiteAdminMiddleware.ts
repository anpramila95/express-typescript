import { Request, Response, NextFunction } from 'express';
import Site from '../models/Site';
import Log from './Log';

interface AuthenticatedUser {
    id: number;
    isAdmin?: boolean; // Thêm trường admin toàn cục nếu có
}

class SiteAdminMiddleware {
    public static async isSiteAdmin(req: Request, res: Response, next: NextFunction): Promise<any> {
        try {
            const user = req.user as unknown as AuthenticatedUser;
            
            // Lấy domain trực tiếp từ host của request
            const domain = req.hostname;
            Log.info(`Checking ownership for domain: ${domain}`);

            // Admin toàn cục luôn có quyền truy cập
            if (user.isAdmin === true) {
                return next();
            }

            const isOwner = await Site.isUserAdminOfSiteByDomain(domain, user.id);

            if (isOwner) {
                // Nếu là chủ sở hữu, cho phép đi tiếp
                return next();
            }

            // Nếu không phải, từ chối truy cập
            return res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này trên trang này.' });

        } catch (error) {
            return res.status(500).json({ error: 'Lỗi máy chủ khi xác thực quyền.' });
        }
    }
}

export default SiteAdminMiddleware;
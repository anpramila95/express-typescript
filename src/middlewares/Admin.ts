import { Request, Response, NextFunction } from 'express';

class AdminMiddleware {
    public static isAdmin(req: Request, res: Response, next: NextFunction): any {
        const user = req.user as any; // Giả sử req.user có trường isAdmin

        if (user && user.isAdmin === true) {
            return next();
        }

        return res.status(403).json({ error: 'Truy cập bị từ chối. Yêu cầu quyền admin.' });
    }
}

export default AdminMiddleware;
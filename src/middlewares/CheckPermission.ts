import { Request, Response, NextFunction } from 'express';
import { IUser } from '../interfaces/models/user';
import User from '../models/User'; // Model User của bạn

// Middleware này nhận vào tên quyền yêu cầu
export const checkPermission = (requiredPermission: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = req.user as IUser;

            // Lấy danh sách tất cả các quyền của người dùng từ database
            // Bạn cần viết hàm này trong model User
            const userPermissions = await User.getPermissions(user.id); 

            if (userPermissions.includes(requiredPermission)) {
                return next(); // Cho phép truy cập
            }

            // Nếu không có quyền, trả về lỗi 403 Forbidden
            return res.status(403).json({ 
                error: 'Bạn không có quyền thực hiện hành động này.' 
            });

        } catch (error) {
            return res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
        }
    };
};
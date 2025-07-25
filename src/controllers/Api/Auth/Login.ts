/**
 * Define Login Logic for the API
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import * as jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

import User from '../../../models/User';
import Site, {ISite} from '../../../models/Site';
import BlockedUser from '../../../models/BlockedUser'; // <-- 1. Import model BlockedUser
import Log from '../../../middlewares/Log';

class Login {
    public static async perform(req: Request, res: Response): Promise<any> {
        req.assert('email', 'E-mail cannot be blank').notEmpty();
        req.assert('email', 'E-mail is not valid').isEmail();
        req.assert('password', 'Password cannot be blank').notEmpty();
        req.assert('password', 'Password length must be at least 8 characters').isLength({ min: 8 });
        req.sanitize('email').normalizeEmail({ gmail_remove_dots: false });

        const errors = req.validationErrors();

        if (errors) {
            return res.status(400).json({ errors });
        }

        try {
            const email = req.body.email.toLowerCase();
            const password = req.body.password;

            const site = (req as any).site as ISite; 

            const user = await User.findOne({ email: email, site_id: site.id });
            if (!user) {
                return res.status(404).json({
                    error: 'Tài khoản hoặc mật khẩu không chính xác.' // Thông báo chung chung để tăng bảo mật
                });
            }


            // --- Logic kiểm tra khóa đã được cập nhật ---
            const blockDetails = await BlockedUser.findBlockDetails(user.id);
            if (blockDetails) {
                Log.warn(`Đăng nhập bị chặn cho user ID: ${user.id} trên site ID: ${site.id}`);
                
                // Xây dựng thông báo lỗi
                let errorMessage = 'Tài khoản của bạn đã bị khóa trên trang web này.';
                if (blockDetails.reason) {
                    errorMessage += ` Lý do: ${blockDetails.reason}`;
                }

                return res.status(403).json({
                    error: errorMessage
                });
            }
            // --- Kết thúc logic kiểm tra ---

            if (!user.password) {
                return res.status(401).json({
                    error: 'Vui lòng đăng nhập bằng tài khoản mạng xã hội của bạn.'
                });
            }

            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                return res.status(401).json({
                    error: 'Tài khoản hoặc mật khẩu không chính xác.'
                });
            }

            // Xác định quyền admin
            let isAdmin = user.isAdmin ? true : false;
            if (site.user_id === user.id) {
                isAdmin = true; // Người dùng là chủ sở hữu của site
            }

            const token = jwt.sign(
                { id: user.id, email: user.email, isAdmin: isAdmin, siteId: site.id },
                res.locals.app.appSecret,
                { expiresIn: res.locals.app.jwtExpiresIn * 60 }
            );

            // Ẩn các cột nhạy cảm
            user.password = undefined;
            user.tokens = undefined;

            return res.json({
                token,
                token_expires_in: res.locals.app.jwtExpiresIn * 60
            });

        } catch (err) {
            Log.error(err.message);
            return res.status(500).json({
                error: err.message
            });
        }
    }
}

export default Login;
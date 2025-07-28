/**
 * Define Login Logic for the API
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import * as jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

import User from '../../../models/User';
import Site, { ISite } from '../../../models/Site';
import BlockedUser from '../../../models/BlockedUser'; // <-- 1. Import model BlockedUser
import Log from '../../../middlewares/Log';
import * as speakeasy from 'speakeasy';


/** event */
import Event from '../../../providers/Event';
import { events } from '../../../events/definitions';

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

            // KIỂM TRA 2FA
            if (user.two_fa_enabled) {
                // Nếu 2FA đã được bật, trả về thông báo yêu cầu xác thực bước 2
                // Tạo một token tạm thời để biết user nào đang chờ xác thực 2FA
                const tempToken = jwt.sign(
                    { id: user.id, action: '2fa_verify' },
                    res.locals.app.appSecret,
                    { expiresIn: '5m' } // Token tạm thời chỉ có hiệu lực 5 phút
                );

                return res.status(200).json({
                    message: 'Please provide your 2FA token.',
                    two_factor_required: true,
                    temp_token: tempToken
                });
            }

            Event.emit(events.user.loggedIn, { user, site }); // Emit sự kiện đăng nhập

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

     /**
     * Giai đoạn 2: Xác thực mã 2FA
     */
    public static async verify2FA(req: Request, res: Response): Promise<any> {
        const { temp_token, code } = req.body;

        if (!temp_token || !code) {
            return res.status(400).json({ error: 'Temporary token and 2FA code are required.' });
        }

        try {
            const decoded: any = jwt.verify(temp_token, res.locals.app.appSecret);
            if (decoded.action !== '2fa_verify') {
                return res.status(401).json({ error: 'Invalid temporary token.' });
            }

            const user = await User.findById(decoded.id);
            if (!user || !user.two_fa_enabled || !user.two_fa_secret) {
                return res.status(401).json({ error: '2FA is not enabled for this user.' });
            }

            const verified = speakeasy.totp.verify({
                secret: user.two_fa_secret,
                encoding: 'base32',
                token: code,
                window: 1 // Cho phép chênh lệch thời gian 1 khoảng (30s)
            });

            if (!verified) {
                return res.status(401).json({ error: 'Invalid 2FA code.' });
            }

            // Nếu mã 2FA chính xác, tạo token đăng nhập cuối cùng
            const isAdmin = user.isAdmin ? true : false;
            const finalToken = jwt.sign(
                { email: user.email, id: user.id, isAdmin: isAdmin },
                res.locals.app.appSecret,
                { expiresIn: res.locals.app.jwtExpiresIn * 60 }
            );

            user.password = undefined;
            return res.json({ user, token: finalToken, token_expires_in: res.locals.app.jwtExpiresIn * 60 });

        } catch (error) {
            return res.status(401).json({ error: 'Invalid or expired temporary token.' });
        }
    }
}

export default Login;
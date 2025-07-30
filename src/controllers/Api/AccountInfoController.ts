import { Request, Response } from 'express';
import User from '../../models/User';
import UserCredit from '../../models/UserCredit';
import Subscription from '../../models/Subscription';
import Log from '../../middlewares/Log';
//import getToken from '../../services/getTokenService'; // Import service mới
import { ISite } from '../../models/Site'; // Import interface ISite
import Notification from '../../models/Notification';
import { IUser } from '../../interfaces/models/user';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';

interface AuthenticatedUser {
    id: number;
    email: string;
    isAdmin?: boolean; // Thêm trường isAdmin để xác định quyền admin
    site_id?: number;
}

class AccountInfoController {
    /**
     * Lấy thông tin tài khoản tổng hợp của người dùng đã đăng nhập.
     */
    public static async getInfo(req: Request, res: Response): Promise<Response> {
        const authUser = req.user as unknown as AuthenticatedUser;
        // Lấy object site (ISite) từ middleware TenantResolver
        const site = req.site as ISite; // Lấy thông tin site từ middleware TenantResolver

        try {
            // Sử dụng Promise.all để thực hiện các truy vấn song song, tăng hiệu suất
            const [
                userDetails,
                creditDetails,
                subscriptionPlan
            ] = await Promise.all([
                User.findById(authUser.id),
                UserCredit.getTotalBalance(authUser.id),
                Subscription.findActivePlanByUserId(authUser.id)
            ]);

            if (!userDetails) {
                return res.status(404).json({ error: req.__('user.not_found') });
            }

            // Xóa các thông tin nhạy cảm trước khi trả về
            userDetails.password = undefined;
            userDetails.tokens = undefined;
            userDetails.passwordResetToken = undefined;
            userDetails.passwordResetExpires = undefined;
            userDetails.facebook = undefined;
            userDetails.twitter = undefined;
            userDetails.google = undefined;
            userDetails.github = undefined;
            userDetails.site_id = undefined;


            // Xây dựng đối tượng phản hồi
            const accountInfo = {
                user: userDetails,
                // tokens: await getToken.piclumen(),
                credits: {
                    balance: creditDetails ? creditDetails : 0
                },
                subscription: subscriptionPlan || {
                    name: req.__('subscription.free_plan'),
                    description: req.__('subscription.default_description')
                    // Bạn có thể lấy thông tin gói free mặc định từ DB để hiển thị ở đây
                },
                message: req.__('account_info.success')
            };
            //updateLastLogin
            await User.updateLastLogin(authUser.id);

            return res.json(accountInfo);

        } catch (error) {
            Log.error(`[AccountInfoController] Lỗi khi lấy thông tin tài khoản cho user ID ${authUser.id}: ${error.stack}`);
            return res.status(500).json({ error: req.__('general.server_error') });
        }
    }

    /**
     * API để lấy danh sách thông báo
     */
    public static async list(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        const { limit = '10', page = '1', unreadOnly = 'false' } = req.query;

        try {
            const pageNum = parseInt(page as string, 10);
            const limitNum = parseInt(limit as string, 10);
            const offset = (pageNum - 1) * limitNum;

            const result = await Notification.findByUserId(user.id, {
                limit: limitNum,
                offset,
                unreadOnly: unreadOnly === 'true'
            });

            return res.json({
                message: req.__('notification.list_success'),
                data: result.notifications,
                pagination: {
                    totalItems: result.total,
                    currentPage: pageNum,
                    perPage: limitNum,
                    totalPages: Math.ceil(result.total / limitNum)
                }
            });

        } catch (error) {
            Log.error(`[NotificationController] ${error}`);
            return res.status(500).json({ error: req.__('notification.error_occurred') });
        }
    }

    /**
     * API để đánh dấu một thông báo là đã đọc
     */
    public static async markAsRead(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        const { notificationId } = req.params;

        try {
            const success = await Notification.markAsRead(Number(notificationId), user.id);
            if (!success) {
                return res.status(404).json({ error: req.__('notification.not_found_or_no_permission') });
            }
            return res.json({ message: req.__('notification.mark_read_success') });
        } catch (error) {
            Log.error(`[NotificationController] ${error}`);
            return res.status(500).json({ error: req.__('notification.error_occurred') });
        }
    }

     /**
     * API để đánh dấu tất cả là đã đọc
     */
    public static async markAllAsRead(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        try {
            const count = await Notification.markAllAsRead(user.id);
            return res.json({ message: req.__('notification.mark_all_read_success', { count: count.toString() }) });
        } catch (error)
        {
            Log.error(`[NotificationController] ${error}`);
            return res.status(500).json({ error: req.__('notification.error_occurred') });
        }
    }


    /**
     * Bắt đầu quá trình thiết lập 2FA.
     * Tạo ra một secret và mã QR để người dùng quét.
     */
    public static async setup(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;

        const secret = speakeasy.generateSecret({
            name: `YourAppName (${user.email})` // Tên sẽ hiển thị trên app Authenticator
        });

        // Tạm thời lưu secret vào user object để xác thực ở bước sau
        // Trong ứng dụng thực tế, bạn có thể lưu vào session hoặc cache
        await User.updateData(user.id, { two_fa_secret: secret.base32 });

        const qrCodeDataURL = await qrcode.toDataURL(secret.otpauth_url);

        return res.json({
            message: req.__('auth.2fa_scan_qr'),
            secret: secret.base32, // Gửi secret để user có thể nhập thủ công
            qrCode: qrCodeDataURL
        });
    }

    /**
     * Xác thực mã TOTP và chính thức bật 2FA
     */
    public static async verifyAndEnable(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        const { token } = req.body;

        const getUser = await User.findById(user.id);

        if (!getUser.two_fa_secret) {
            return res.status(400).json({ error: req.__('auth.2fa_secret_not_found') });
        }

        const verified = speakeasy.totp.verify({
            secret: getUser.two_fa_secret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            // Nếu mã chính xác, bật 2FA
            await User.updateData(user.id, { two_fa_enabled: true });
            return res.json({ message: req.__('auth.2fa_setup_success') });
        }

        return res.status(400).json({ error: req.__('auth.2fa_invalid_code') });
    }

    /**
     * Vô hiệu hóa 2FA
     */
    public static async disable(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: req.__('auth.password_required') });
        }

        // Lấy thông tin user từ DB để kiểm tra mật khẩu
        const userFromDb = await User.findById(user.id);
        if (!userFromDb) {
            return res.status(404).json({ error: req.__('user.not_found') });
        }

        // Giả sử User model có phương thức comparePassword
        const isMatch = await userFromDb.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: req.__('auth.password_incorrect') });
        }

        await User.updateData(user.id, {
            two_fa_enabled: false,
            two_fa_secret: null
        });

        return res.json({ message: req.__('auth.2fa_disabled_success') });
    }
}

export default AccountInfoController;
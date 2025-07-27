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
                return res.status(404).json({ error: 'Không tìm thấy thông tin người dùng.' });
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
                    name: "Gói Miễn Phí",
                    description: "Bạn đang ở gói mặc định."
                    // Bạn có thể lấy thông tin gói free mặc định từ DB để hiển thị ở đây
                },
                message: req.__('account_info.success')
            };
            //updateLastLogin
            await User.updateLastLogin(authUser.id);

            return res.json(accountInfo);

        } catch (error) {
            Log.error(`[AccountInfoController] Lỗi khi lấy thông tin tài khoản cho user ID ${authUser.id}: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ khi lấy thông tin tài khoản.' });
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
                message: 'Lấy danh sách thông báo thành công',
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
            return res.status(500).json({ error: 'Đã có lỗi xảy ra, vui lòng thử lại.' });
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
                return res.status(404).json({ error: 'Không tìm thấy thông báo hoặc bạn không có quyền.' });
            }
            return res.json({ message: 'Đã cập nhật thông báo.' });
        } catch (error) {
            Log.error(`[NotificationController] ${error}`);
            return res.status(500).json({ error: 'Đã có lỗi xảy ra, vui lòng thử lại.' });
        }
    }

     /**
     * API để đánh dấu tất cả là đã đọc
     */
    public static async markAllAsRead(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        try {
            const count = await Notification.markAllAsRead(user.id);
            return res.json({ message: `Đã cập nhật ${count} thông báo.` });
        } catch (error)
        {
            Log.error(`[NotificationController] ${error}`);
            return res.status(500).json({ error: 'Đã có lỗi xảy ra, vui lòng thử lại.' });
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
            message: 'Scan this QR code with your authenticator app.',
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

        if (!user.two_fa_secret) {
            return res.status(400).json({ error: '2FA secret not found. Please setup first.' });
        }

        const verified = speakeasy.totp.verify({
            secret: user.two_fa_secret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            // Nếu mã chính xác, bật 2FA
            await User.updateData(user.id, { two_fa_enabled: true });
            return res.json({ message: '2FA has been enabled successfully.' });
        }

        return res.status(400).json({ error: 'Invalid token. Please try again.' });
    }

    /**
     * Vô hiệu hóa 2FA
     */
    public static async disable(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        // Cần xác thực lại mật khẩu trước khi cho phép vô hiệu hóa
        const { password } = req.body;
        // ... (thêm logic kiểm tra password ở đây)

        await User.updateData(user.id, {
            two_fa_enabled: false,
            two_fa_secret: null // Xóa secret
        });

        return res.json({ message: '2FA has been disabled.' });
    }
}

export default AccountInfoController;
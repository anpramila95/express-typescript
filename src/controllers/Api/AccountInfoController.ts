import { Request, Response } from 'express';
import User from '../../models/User';
import UserCredit from '../../models/UserCredit';
import Subscription from '../../models/Subscription';
import Log from '../../middlewares/Log';
import { ISite } from '../../models/Site'; // << Import interface ISite

interface AuthenticatedUser {
    id: number;
    email: string;
    isAdmin?: boolean; // Thêm trường isAdmin để xác định quyền admin
}

class AccountInfoController {
    /**
     * Lấy thông tin tài khoản tổng hợp của người dùng đã đăng nhập.
     */
    public static async getInfo(req: Request, res: Response): Promise<Response> {
        const authUser = req.user as unknown as AuthenticatedUser;
         // Lấy object site (ISite) từ middleware TenantResolver
        

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

            // Xây dựng đối tượng phản hồi
            const accountInfo = {
                user: userDetails,
                credits: {
                    balance: creditDetails ? creditDetails : 0
                },
                subscription: subscriptionPlan || {
                    name: "Gói Miễn Phí",
                    description: "Bạn đang ở gói mặc định."
                    // Bạn có thể lấy thông tin gói free mặc định từ DB để hiển thị ở đây
                }
            };
            //updateLastLogin
            await User.updateLastLogin(authUser.id);

            return res.json(accountInfo);

        } catch (error) {
            Log.error(`[AccountInfoController] Lỗi khi lấy thông tin tài khoản cho user ID ${authUser.id}: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ khi lấy thông tin tài khoản.' });
        }
    }
}

export default AccountInfoController;
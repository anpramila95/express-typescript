import { Request, Response } from 'express';
import Transaction from '../../../models/Transaction';
import UserCredit from '../../../models/UserCredit';
import SubscriptionService from '../../../services/SubscriptionService';
import Log from '../../../middlewares/Log';
import SubscriptionPlan from '../../../models/SubscriptionPlan';
import User from '../../../models/User';
import AffiliateService from '../../../services/AffiliateService';
import WithdrawalRequest from '../../../models/WithdrawalRequest';
import Site, { ISite } from "../../../models/Site";
// --- Thêm các import cần thiết ---
import Subscription from '../../../models/Subscription';
import PricingPlan from '../../../models/PricingPlan';

interface AuthenticatedAdmin {
    id: number;
    email: string;
    isAdmin: boolean;
}

class ApprovalController {
    /**
     * Lấy danh sách tất cả các giao dịch đang chờ duyệt.
     * (Hàm này giữ nguyên)
     */
    public static async listPending(req: Request, res: Response): Promise<Response> {
        // ... không thay đổi ...
        const pendingTransactions = await Transaction.findAllPending();
        return res.json(pendingTransactions);
    }

    /**
     * Admin duyệt một yêu cầu (nâng cấp hoặc mua credit) đang chờ xử lý.
     * (CẬP NHẬT LOGIC)
     */
    public static async approvePending(req: Request, res: Response): Promise<Response> {
        const admin = req.user as unknown as AuthenticatedAdmin;
        const site = req.site as ISite;

        const { transactionId } = req.params;
        const { adminNotes } = req.body;

        const transaction = await Transaction.findByIdWithPaymentDetails(transactionId);
        if (!transaction || transaction.status !== 'pending') {
            return res.status(404).json({ error: 'Giao dịch không hợp lệ hoặc đã được xử lý.' });
        }

        // if(transaction.user_id == admin.id) {
        //     return res.status(403).json({ error: "Bạn không thể tự duyệt giao dịch cho chính mình." });
        // }

        const userIdBelongsToSite = await User.userIdBelongsToSite(transaction.user_id, site);

        if(!userIdBelongsToSite) {
            return res.status(403).json({ error: "Người dùng không thuộc về site này." });
        }

        try {
            if (transaction.type === 'credit') {
                await UserCredit.add(
                    transaction.user_id,
                    transaction.credits_change,
                    'purchased',
                    365,
                    transaction.id
                );
            } else if (transaction.type === 'subscription') {
                // --- LOGIC MỚI BẮT ĐẦU TỪ ĐÂY ---
                if (!transaction.meta || !transaction.meta.pricing_id) {
                    return res.status(400).json({ error: 'Giao dịch subscription không có pricing_id trong meta.' });
                }
                const pricingPlanId = transaction.meta.pricing_id;

                // 1. Hủy gói cũ (nếu có)
                await Subscription.deactivateAllForUser(transaction.user_id);
                // 2. Tạo gói mới dựa trên pricingPlanId từ giao dịch
                await Subscription.create({ userId: transaction.user_id, pricingPlanId });

                // Xử lý hoa hồng (giữ nguyên)
                await AffiliateService.processSubscriptionCommission(transaction);
                // --- KẾT THÚC LOGIC MỚI ---
            }

            await Transaction.updateStatus(transactionId, 'approved', adminNotes || 'Đã duyệt bởi admin');
            return res.json({ message: 'Giao dịch đã được duyệt thành công.' });
        } catch (error) {
            Log.error(`Lỗi khi duyệt giao dịch ID ${transactionId}: ${error.stack}`);
            return res.status(500).json({ error: `Đã xảy ra lỗi trong quá trình xử lý: ${error.message}` });
        }
    }

    /**
     * Admin từ chối một yêu cầu đang chờ xử lý.
     * (Hàm này giữ nguyên, chỉ sửa lại vài câu chữ)
     */
    public static async rejectPending(req: Request, res: Response): Promise<Response> {
        // ... không thay đổi logic, chỉ sửa message ...
        const admin = req.user as unknown as AuthenticatedAdmin;
        const site = req.site as ISite;
        const { transactionId } = req.params;
        const { adminNotes } = req.body;
        if (!adminNotes) return res.status(400).json({ error: 'Vui lòng cung cấp lý do từ chối.' });
        const transaction = await Transaction.findByIdWithPaymentDetails(transactionId);
        if (!transaction || transaction.status !== 'pending') {
            return res.status(404).json({ error: 'Giao dịch không hợp lệ hoặc đã được xử lý.' });
        }
        if(transaction.user_id == admin.id) {
            return res.status(403).json({ error: "Bạn không thể tự xử lý giao dịch cho chính mình." });
        }
        const userIdBelongsToSite = await User.userIdBelongsToSite(transaction.user_id, site);
        if(!userIdBelongsToSite) {
            return res.status(403).json({ error: "Người dùng không thuộc về site này." });
        }
        await Transaction.updateStatus(transactionId, 'rejected', adminNotes);
        return res.json({ message: 'Giao dịch đã bị từ chối.' });
    }

    /**
     * Admin tự gán một gói subscription cho người dùng (không qua yêu cầu).
     * (CẬP NHẬT LOGIC)
     */
    public static async assignSubscription(req: Request, res: Response): Promise<Response> {
        const admin = req.user as unknown as AuthenticatedAdmin;
        const site = req.site as ISite;
        // --- Thay planId bằng pricingPlanId ---
        const { userId, pricingPlanId, adminNotes = "Gán trực tiếp bởi Admin" } = req.body;

        if (!userId || !pricingPlanId) {
            return res.status(400).json({ error: 'Cần cung cấp userId và pricingPlanId.' });
        }
        if(userId == admin.id) {
            return res.status(403).json({ error: "Bạn không thể tự gán gói cho chính mình." });
        }

        try {
            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
            if(user.site_id !== site.id && user.id !== site.user_id) {
                return res.status(403).json({ error: "Người dùng không thuộc về site này." });
            }

            // --- Kiểm tra pricing plan có tồn tại không ---
            const pricingPlan = await PricingPlan.findById(pricingPlanId);
            if (!pricingPlan) return res.status(404).json({ error: 'Không tìm thấy gói giá (pricing plan).' });

            // 1. Hủy gói cũ của người dùng
            await Subscription.deactivateAllForUser(userId);
            // 2. Tạo gói mới
            const newSubscription = await Subscription.create({ userId, pricingPlanId });

            // 3. Tạo một bản ghi giao dịch đã được duyệt để lưu lại lịch sử
            const plan = await SubscriptionPlan.findById(pricingPlan.plan_id); // Lấy plan gốc để ghi log
            const description = `Admin gán trực tiếp gói: ${plan.name} - ${pricingPlan.name}`;
            const meta = { pricing_id: pricingPlan.id, subscription_id: newSubscription.id };

            // await Transaction.createCompleted({
            //     user_id: userId,
            //     type: 'subscription',
            //     status: 'approved',
            //     description: description,
            //     amount: pricingPlan.price, // Ghi lại giá tại thời điểm gán
            //     plan_id: pricingPlan.plan_id,
            //     meta: JSON.stringify(meta),
            //     notes: adminNotes
            // });

            return res.json({ message: `Đã gán thành công gói "${pricingPlan.name}" cho người dùng.` });
        } catch (error) {
            Log.error(`Lỗi khi admin gán gói: ${error.stack}`);
            return res.status(500).json({ error: `Đã xảy ra lỗi hệ thống: ${error.message}` });
        }
    }


    /**
     * Admin tự cộng credit cho người dùng (ví dụ: tặng, khuyến mãi).
     * (Hàm này giữ nguyên)
     */
    public static async giveCredits(req: Request, res: Response): Promise<Response> {
        // ... không thay đổi ...
        const admin = req.user as unknown as AuthenticatedAdmin;
        const site = req.site as ISite;
        const { userId, amount, type = 'promotional', expiresInDays, adminNotes } = req.body;
        if (!userId || !amount) {
            return res.status(400).json({ error: 'Cần cung cấp userId và amount.' });
        }
        if(userId == admin.id) {
            return res.status(403).json({ error: "Bạn không thể tự cộng credit cho chính mình." });
        }
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
        if(user.site_id !== site.id && user.id !== site.user_id) {
            return res.status(403).json({ error: "Người dùng không thuộc về site này." });
        }
        try {
            await UserCredit.add(userId, amount, type, expiresInDays);
            return res.json({ message: `Đã cộng thành công ${amount} credit (${type}) cho người dùng.` });
        } catch (error) {
            Log.error(`Lỗi khi admin cộng credit: ${error.stack}`);
            return res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống.' });
        }
    }

    // Các hàm xử lý rút tiền (listPendingWithdrawals, listWithdrawals, v.v.) không thay đổi
    // ...
    // ... (Giữ nguyên các hàm còn lại)
    /**
     * Lấy danh sách các yêu cầu rút tiền đang chờ duyệt.
     */
    public static async listPendingWithdrawals(req: Request, res: Response): Promise<Response> {
        const requests = await WithdrawalRequest.findAllPending();
        return res.json(requests);
    }

    /**
     * Lấy danh sách yêu cầu rút tiền (có thể lọc theo trạng thái và có phân trang).
     * Dành cho admin.
     */
    public static async listWithdrawals(req: Request, res: Response): Promise<Response> {
        const { status, page = 1, limit = 15 } = req.query;
        const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

        try {
            const { items, total } = await WithdrawalRequest.findAll({
                status: status as any,
                limit: parseInt(limit as string, 10),
                offset
            });

            return res.json({
                items,
                pager: {
                    currentPage: parseInt(page as string, 10),
                    perPage: parseInt(limit as string, 10),
                    totalItems: total,
                    totalPages: Math.ceil(total / parseInt(limit as string, 10))
                }
            });
        } catch (error) {
            Log.error(`Lỗi khi admin lấy danh sách yêu cầu rút tiền: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }

    /**
     * Lấy thông tin chi tiết của một yêu cầu rút tiền.
     */
    public static async getWithdrawalDetails(req: Request, res: Response): Promise<Response> {
        const { requestId } = req.params;

        try {
            const details = await WithdrawalRequest.findDetailsById(parseInt(requestId, 10));

            if (details) {
                return res.json(details);
            } else {
                return res.status(404).json({ error: 'Không tìm thấy yêu cầu rút tiền.' });
            }
        } catch (error) {
            Log.error(`Lỗi khi lấy chi tiết yêu cầu rút tiền: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }

    /**
     * Xử lý một yêu cầu rút tiền (duyệt hoặc từ chối).
     */
    public static async processWithdrawal(req: Request, res: Response): Promise<Response> {
        const { requestId } = req.params;
        const { status, adminNotes } = req.body; // status: 'approved' hoặc 'rejected'

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
        }
        if (status === 'rejected' && !adminNotes) {
            return res.status(400).json({ error: 'Vui lòng cung cấp lý do từ chối.' });
        }

        try {
            const success = await WithdrawalRequest.updateStatus(parseInt(requestId, 10), status, adminNotes);
            if (success) {
                return res.json({ message: `Đã xử lý yêu cầu rút tiền thành công với trạng thái: ${status}.` });
            } else {
                return res.status(404).json({ error: 'Không tìm thấy yêu cầu hoặc yêu cầu đã được xử lý.' });
            }
        } catch (error) {
            Log.error(`Lỗi khi xử lý yêu cầu rút tiền: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }
}

export default ApprovalController;
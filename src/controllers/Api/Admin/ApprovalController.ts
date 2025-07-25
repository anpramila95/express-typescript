import { Request, Response } from 'express';
import Transaction from '../../../models/Transaction';
import UserCredit from '../../../models/UserCredit';
import SubscriptionService from '../../../services/SubscriptionService';
import Log from '../../../middlewares/Log';
import SubscriptionPlan from '../../../models/SubscriptionPlan';
import User from '../../../models/User';
import AffiliateService from '../../../services/AffiliateService'; // <-- Import service mới
import WithdrawalRequest from '../../../models/WithdrawalRequest';


interface AuthenticatedUser {
    id: number;
    email: string;
    isAdmin: boolean; // Thêm trường isAdmin để xác định quyền admin
}
class ApprovalController {
    /**
     * Lấy danh sách tất cả các giao dịch đang chờ duyệt.
     */
    public static async listPending(req: Request, res: Response): Promise<Response> {
        const pendingTransactions = await Transaction.findAllPending();
        return res.json(pendingTransactions);
    }

    /**
     * Admin duyệt một yêu cầu (nâng cấp hoặc mua credit) đang chờ xử lý.
     */
    public static async approvePending(req: Request, res: Response): Promise<Response> {
        const { transactionId } = req.params;
        const { adminNotes } = req.body;

        const transaction = await Transaction.findByIdWithPaymentDetails(transactionId);
        if (!transaction || transaction.status !== 'pending') {
            return res.status(404).json({ error: 'Giao dịch không hợp lệ hoặc đã được xử lý.' });
        }

        try {
            // Xử lý tùy theo loại giao dịch
            if (transaction.type === 'credit') {
                // Khi admin duyệt, credit được coi là 'purchased'
                await UserCredit.add(
                    transaction.user_id,
                    transaction.credits_change,
                    'purchased', // Loại credit
                    365,          // Hạn sử dụng (ví dụ: 365 ngày)
                    transaction.id // ID giao dịch gốc
                );
            } else if (transaction.type === 'subscription') {
                await SubscriptionService.changeUserPlan(transaction.user_id, transaction.plan_id);
                await AffiliateService.processSubscriptionCommission(transaction);

            }

            // Cập nhật trạng thái giao dịch
            await Transaction.updateStatus(transactionId, 'approved', adminNotes ? adminNotes : 'Đã duyệt bởi admin');
            return res.json({ message: 'Giao dịch đã được duyệt thành công.' });
        } catch (error) {
            Log.error(`Lỗi khi duyệt giao dịch ID ${transactionId}: ${error.stack}`);
            return res.status(500).json({ error: 'Đã xảy ra lỗi trong quá trình xử lý.' });
        }
    }

    /**
     * Admin từ chối một yêu cầu đang chờ xử lý.
     */
    public static async rejectPending(req: Request, res: Response): Promise<Response> {
        const { transactionId } = req.params;
        const { adminNotes } = req.body;

        if (!adminNotes) return res.status(400).json({ error: 'Vui lòng cung cấp lý do từ chối.' });

        const transaction = await Transaction.findByIdWithPaymentDetails(transactionId);
        if (!transaction || transaction.status !== 'pending') {
            return res.status(404).json({ error: 'Giao dịch không hợp lệ hoặc đã được xử lý.' });
        }

        await Transaction.updateStatus(transactionId, 'rejected', adminNotes ? adminNotes : 'Đã từ chối bởi admin');
        return res.json({ message: 'Giao dịch đã bị từ chối.' });
    }

    /**
     * Admin tự gán một gói subscription cho người dùng (không qua yêu cầu).
     */
    public static async assignSubscription(req: Request, res: Response): Promise<Response> {
        const { userId, planId, adminNotes = null } = req.body;

        if (!userId || !planId) {
            return res.status(400).json({ error: 'Cần cung cấp userId và planId.' });
        }

        // Kiểm tra xem user và plan có tồn tại không
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

        const plan = await SubscriptionPlan.findById(planId);
        if (!plan) return res.status(404).json({ error: 'Không tìm thấy gói dịch vụ.' });

        try {
            // Thay đổi gói cho người dùng
            await SubscriptionService.changeUserPlan(userId, planId);

            // Tạo một bản ghi giao dịch đã được duyệt để lưu lại lịch sử
            const description = `Admin gán trực tiếp gói: ${plan.name}`;
            await Transaction.createSubscriptionRequest(userId, plan); // Tạo request
            // Bạn có thể viết thêm logic để tìm và duyệt ngay request vừa tạo nếu cần

            return res.json({ message: `Đã gán thành công gói "${plan.name}" cho người dùng.` });
        } catch (error) {
            Log.error(`Lỗi khi admin gán gói: ${error.stack}`);
            return res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống.' });
        }
    }

    /**
     * Admin tự cộng credit cho người dùng (ví dụ: tặng, khuyến mãi).
     */
    public static async giveCredits(req: Request, res: Response): Promise<Response> {
        const { userId, amount, type = 'promotional', expiresInDays, adminNotes } = req.body;

        if (!userId || !amount) {
            return res.status(400).json({ error: 'Cần cung cấp userId và amount.' });
        }

        // Kiểm tra user có tồn tại
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

        try {
            // Cộng credit trực tiếp
            await UserCredit.add(userId, amount, type, expiresInDays);

            // TODO: Bạn có thể tạo một bản ghi transaction đã duyệt ở đây để lưu log nếu muốn

            return res.json({ message: `Đã cộng thành công ${amount} credit (${type}) cho người dùng.` });
        } catch (error) {
            Log.error(`Lỗi khi admin cộng credit: ${error.stack}`);
            return res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống.' });
        }
    }

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
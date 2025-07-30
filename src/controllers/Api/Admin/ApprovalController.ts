import { Request, Response } from 'express';
import Transaction from '../../../models/Transaction';
import UserCredit from '../../../models/UserCredit';
import SubscriptionService from '../../../services/SubscriptionService';
import Log from '../../../middlewares/Log';
import SubscriptionPlan from '../../../models/SubscriptionPlan';
import User from '../../../models/User';
import AffiliateService from '../../../services/AffiliateService';
import WithdrawalRequest, { WithdrawalStatus } from '../../../models/WithdrawalRequest';
import Site, { ISite } from "../../../models/Site";
// --- Thêm các import cần thiết ---
import Subscription from '../../../models/Subscription';
import PricingPlan from '../../../models/PricingPlan';
import NotificationService from '../../../services/NotificationService'; // <-- THÊM DÒNG NÀY
import AuditLogService from '../../../services/AuditLogService';


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
            return res.status(404).json({ error: req.__('admin.invalid_transaction') });
        }

        // if(transaction.user_id == admin.id) {
        //     return res.status(403).json({ error: req.__('admin.cannot_self_approve') });
        // }

        const userIdBelongsToSite = await User.userIdBelongsToSite(transaction.user_id, site);

        if (!userIdBelongsToSite) {
            return res.status(403).json({ error: req.__('admin.user_not_in_site') });
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
                    return res.status(400).json({ error: req.__('admin.missing_pricing_id') });
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

            await Transaction.updateStatus(transactionId, 'approved', adminNotes || req.__('admin.approved_by_admin'));
            // GỬI THÔNG BÁO QUA NOVU


            // GỌI SERVICE ĐỂ TẠO THÔNG BÁO
            await NotificationService.create(
                transaction.user_id,
                'transaction_approved',
                req.__('admin.transaction_approved_title'),
                req.__('admin.transaction_approved_message', { transactionId })
            );

            await AuditLogService.log({
                siteId: site.id, // Lấy site_id từ người thực hiện hành động
                userId: admin.id,
                action: 'transaction.approved',
                details: {
                    transactionId: transactionId,
                    notes: adminNotes
                },
                ipAddress: req.ip
            });

            return res.json({ message: req.__('admin.transaction_approved') });
        } catch (error) {
            Log.error(`Lỗi khi duyệt giao dịch ID ${transactionId}: ${error.stack}`);
            return res.status(500).json({ error: req.__('admin.processing_error', { error: error.message }) });
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
        if (!adminNotes) return res.status(400).json({ error: req.__('admin.provide_rejection_reason') });
        const transaction = await Transaction.findByIdWithPaymentDetails(transactionId);
        if (!transaction || transaction.status !== 'pending') {
            return res.status(404).json({ error: req.__('admin.invalid_transaction') });
        }
        if (transaction.user_id == admin.id) {
            return res.status(403).json({ error: req.__('admin.cannot_self_process') });
        }
        const userIdBelongsToSite = await User.userIdBelongsToSite(transaction.user_id, site);
        if (!userIdBelongsToSite) {
            return res.status(403).json({ error: req.__('admin.user_not_in_site') });
        }
        await Transaction.updateStatus(transactionId, 'rejected', adminNotes);

        // GỌI SERVICE ĐỂ TẠO THÔNG BÁO
        await NotificationService.create(
            transaction.user_id,
            'transaction_rejected',
            req.__('admin.transaction_rejected_title'),
            req.__('admin.transaction_rejected_message', { transactionId, reason: adminNotes })
        );
        return res.json({ message: req.__('admin.transaction_rejected') });
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
            return res.status(400).json({ error: req.__('admin.provide_user_pricing') });
        }
        if (userId == admin.id) {
            return res.status(403).json({ error: req.__('admin.cannot_self_assign') });
        }

        try {
            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ error: req.__('admin.user_not_found') });
            if (user.site_id !== site.id && user.id !== site.user_id) {
                return res.status(403).json({ error: req.__('admin.user_not_in_site') });
            }

            // --- Kiểm tra pricing plan có tồn tại không ---
            const pricingPlan = await PricingPlan.findByIdSiteId(pricingPlanId, site.id);
            if (!pricingPlan) return res.status(404).json({ error: req.__('admin.pricing_plan_not_found') });

            // 2. Tạo gói mới
            const newSubscription = await SubscriptionService.changeUserPlan(userId, pricingPlanId);

            // 3. Tạo một bản ghi giao dịch đã được duyệt để lưu lại lịch sử
            const plan = await SubscriptionPlan.findById(pricingPlan.plan_id); // Lấy plan gốc để ghi log
            if (!plan) {
                return res.status(404).json({ error: req.__('admin.subscription_plan_not_found') });
            }

            if (plan.site_id != site.id) {
                return res.status(403).json({ error: req.__('admin.plan_not_in_site') });
            }
            // Tạo bản ghi giao dịch đã duyệt
            const description = `Admin gán trực tiếp gói: ${plan.name} - ${pricingPlan.name}`;
            const meta = { pricing_id: pricingPlan.id, subscription_id: newSubscription };

            await Transaction.createCompleted({
                user_id: userId,
                type: 'subscription',
                status: 'approved',
                description: description,
                amount: pricingPlan.price, // Ghi lại giá tại thời điểm gán
                plan_id: pricingPlan.plan_id,
                meta: JSON.stringify(meta),
                notes: adminNotes,
                site_id: site.id
            });
            return res.json({ message: req.__('admin.plan_assigned_success', { planName: pricingPlan.name }) });
        } catch (error) {
            Log.error(`Lỗi khi admin gán gói: ${error.stack}`);
            return res.status(500).json({ error: req.__('admin.system_error', { error: error.message }) });
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
            return res.status(400).json({ error: req.__('admin.provide_user_amount') });
        }
        if (userId == admin.id) {
            return res.status(403).json({ error: req.__('admin.cannot_self_credit') });
        }
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: req.__('admin.user_not_found') });
        if (user.site_id !== site.id && user.id !== site.user_id) {
            return res.status(403).json({ error: req.__('admin.user_not_in_site') });
        }
        try {
            await UserCredit.add(userId, amount, type, expiresInDays);
            return res.json({ message: req.__('admin.credits_added_success', { amount, type }) });
        } catch (error) {
            Log.error(`Lỗi khi admin cộng credit: ${error.stack}`);
            return res.status(500).json({ error: req.__('admin.system_error_simple') });
        }
    }

    //giveCreditsPackage
    // chưa chạy
    public static async giveCreditsPackage(req: Request, res: Response): Promise<Response> {
        const admin = req.user as unknown as AuthenticatedAdmin;
        const site = req.site as ISite;
        const { userId, packageId, adminNotes } = req.body;
        if (!userId || !packageId) {
            return res.status(400).json({ error: req.__('admin.provide_user_package') });
        }
        if (userId == admin.id) {
            return res.status(403).json({ error: req.__('admin.cannot_self_credit') });
        }
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: req.__('admin.user_not_found') });
        if (user.site_id !== site.id && user.id !== site.user_id) {
            return res.status(403).json({ error: req.__('admin.user_not_in_site') });
        }
        try {
            await UserCredit.addPackage(userId, packageId, adminNotes);
            return res.json({ message: req.__('admin.package_added_success', { packageId }) });
        } catch (error) {
            Log.error(`${req.__('admin.package_add_error')}: ${error.stack}`);
            return res.status(500).json({ error: req.__('admin.system_error_simple') });
        }
    }

    // Các hàm xử lý rút tiền (listPendingWithdrawals, listWithdrawals, v.v.) không thay đổi
    // ...
    // ... (Giữ nguyên các hàm còn lại)
    /**
     * Lấy danh sách các yêu cầu rút tiền đang chờ duyệt.
     */
    public static async listPendingWithdrawals(req: Request, res: Response): Promise<Response> {
        // Lấy các tham số từ query string
        const site = req.site as ISite;
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 15;
        const status = 'pending';
        const offset = (page - 1) * limit;

        try {
            // Gọi hàm model với các tùy chọn đã lấy được
            const { items, total } = await WithdrawalRequest.findAndCountAll({
                status,
                limit,
                offset,
                site_id: site.id
            });

            const totalPages = Math.ceil(total / limit);

            // Trả về kết quả có cấu trúc phân trang
            return res.json({
                items,
                pager: {
                    currentPage: page,
                    perPage: limit,
                    totalItems: total,
                    totalPages: totalPages
                }
            });

        } catch (error) {
            Log.error(`Lỗi khi lấy danh sách yêu cầu rút tiền: ${error.stack}`);
            return res.status(500).json({ error: req.__('admin.server_error') });
        }
    }

    /**
     * Lấy danh sách yêu cầu rút tiền (có thể lọc theo trạng thái và có phân trang).
     * Dành cho admin.
     */
    public static async listWithdrawals(req: Request, res: Response): Promise<Response> {
        // Lấy các tham số từ query string
        const site = req.site as ISite;
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 15;
        const status = req.query.status as WithdrawalStatus | undefined; // ví dụ: 'pending', 'approved'
        const offset = (page - 1) * limit;

        try {
            // Gọi hàm model với các tùy chọn đã lấy được
            const { items, total } = await WithdrawalRequest.findAndCountAll({
                status,
                limit,
                offset,
                site_id: site.id
            });

            const totalPages = Math.ceil(total / limit);

            // Trả về kết quả có cấu trúc phân trang
            return res.json({
                items,
                pager: {
                    currentPage: page,
                    perPage: limit,
                    totalItems: total,
                    totalPages: totalPages
                }
            });

        } catch (error) {
            Log.error(`Lỗi khi lấy danh sách yêu cầu rút tiền: ${error.stack}`);
            return res.status(500).json({ error: req.__('admin.server_error') });
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
                return res.status(404).json({ error: req.__('admin.withdrawal_not_found') });
            }
        } catch (error) {
            Log.error(`Lỗi khi lấy chi tiết yêu cầu rút tiền: ${error.stack}`);
            return res.status(500).json({ error: req.__('admin.server_error') });
        }
    }

    /**
     * Xử lý một yêu cầu rút tiền (duyệt hoặc từ chối).
     */
    public static async processWithdrawal(req: Request, res: Response): Promise<Response> {
        const { requestId } = req.params;
        const { status, adminNotes } = req.body; // status: 'approved' hoặc 'rejected'

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: req.__('admin.invalid_status') });
        }
        if (status === 'rejected' && !adminNotes) {
            return res.status(400).json({ error: req.__('admin.provide_rejection_reason_withdrawal') });
        }

        try {
            const success = await WithdrawalRequest.updateStatus(parseInt(requestId, 10), status, adminNotes);
            if (success) {
                return res.json({ message: req.__('admin.withdrawal_processed', { status }) });
            } else {
                return res.status(404).json({ error: req.__('admin.withdrawal_not_found_or_processed') });
            }
        } catch (error) {
            Log.error(`Lỗi khi xử lý yêu cầu rút tiền: ${error.stack}`);
            return res.status(500).json({ error: req.__('admin.server_error') });
        }
    }
}

export default ApprovalController;
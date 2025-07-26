/**
 * Service để quản lý và kiểm tra thông tin gói subscription của người dùng.
 */
import Log from '../middlewares/Log';
import Subscription from '../models/Subscription';
import SubscriptionPlan from '../models/SubscriptionPlan'; // Model này cũng cần thiết
import PricingPlan from '../models/PricingPlan'; // <-- BẠN SẼ CẦN TẠO VÀ IMPORT MODEL NÀY

interface PlanLimits {
    maxConcurrentJobs: number;
    options: any;
}

class SubscriptionService {
    /**
     * Lấy thông tin giới hạn của gói subscription mà người dùng đang sử dụng.
     */
    public static async getPlanLimitsForUser(userId: number): Promise<PlanLimits> {
        Log.info(`[SubscriptionService] Đang kiểm tra gói cho user: ${userId}`);

        // Truy vấn CSDL để lấy gói đang hoạt động của người dùng
        const activePlan = await Subscription.findActivePlanByUserId(userId);

        if (activePlan) {
            // Nếu người dùng có gói, trả về giới hạn của gói đó
            return {
                maxConcurrentJobs: activePlan.max_concurrent_jobs,
                options: activePlan.options || {}
            };
        } else {
            // Nếu người dùng chưa có gói nào, trả về giới hạn của gói mặc định (ví dụ: gói Miễn Phí có ID là 1)
            const defaultPlan = await SubscriptionPlan.findById(1); // Giả sử gói free có id=1
            if (defaultPlan) {
                return {
                    maxConcurrentJobs: defaultPlan.max_concurrent_jobs,
                    options: defaultPlan.options || {}
                };
            }
        }

        // Fallback: Trả về giới hạn an toàn nếu không tìm thấy gói nào
        return {
            maxConcurrentJobs: 1,
            options: { can_remove_watermark: false }
        };
    }

    /**
     * Thay đổi gói dịch vụ cho người dùng (sau khi admin duyệt).
     */
    public static async changeUserPlan(userId: number, pricingId: number, expiresAt?: Date): Promise<number> {
        Log.info(`[SubscriptionService] Bắt đầu đổi gói cho user ${userId} với pricing ${pricingId}`);

        // 1. Lấy thông tin plan từ pricingId
        // Giả định bạn có model PricingPlan với phương thức findById hoặc tương tự
        const pricingPlan = await PricingPlan.findById(pricingId);
        if (!pricingPlan) {
            throw new Error(`[SubscriptionService] Không tìm thấy pricing plan với ID ${pricingId}`);
        }

        // 2. Hủy tất cả các gói đang active của người dùng để tránh trùng lặp
        await Subscription.deactivateAllForUser(userId);

        // 4. Tạo một subscription mới với plan_id đã tìm được và status 'active'
        const subscription = await Subscription.create({
            userId,
            pricingPlanId: pricingId
        });

        Log.info(`[SubscriptionService] Đã đổi gói thành công cho user ${userId}.`);
        return subscription.id;
    }
}

export default SubscriptionService;
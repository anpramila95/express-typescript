/**
 * Service để quản lý và kiểm tra thông tin gói subscription của người dùng.
 */
import Log from '../middlewares/Log';
import Subscription from '../models/Subscription';
import SubscriptionPlan from '../models/SubscriptionPlan'; // Model này cũng cần thiết

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
    public static async changeUserPlan(userId: number, newPlanId: number, expires_at?: Date): Promise<void> {
        Log.info(`[SubscriptionService] Đang đổi gói cho user ${userId} thành plan ${newPlanId}`);
        
        // 1. Hủy tất cả các gói đang active của người dùng để tránh trùng lặp
        await Subscription.deactivateAllForUser(userId);

        
        if(!expires_at) {
            //365 ngày kể từ ngày hiện tại
            expires_at = new Date();
            expires_at.setFullYear(expires_at.getFullYear() + 1);
        }
        
        // 2. Tạo một subscription mới với plan_id mới và status 'active'
        await Subscription.create({ userId, planId: newPlanId, expires_at });

        Log.info(`[SubscriptionService] Đã đổi gói thành công cho user ${userId}.`);
    }
}

export default SubscriptionService;
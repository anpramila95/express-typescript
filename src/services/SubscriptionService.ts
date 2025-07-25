/**
 * Service để quản lý và kiểm tra thông tin gói subscription của người dùng.
 */
import Log from '../middlewares/Log';
// Giả định bạn có bảng subscriptions để lưu gói hiện tại của user
// import Subscription from '../models/Subscription';

interface PlanLimits {
    maxConcurrentJobs: number;
    options: any;
}

class SubscriptionService {
    /**
     * Lấy thông tin giới hạn của gói subscription mà người dùng đang sử dụng.
     */
    public static async getPlanLimitsForUser(userId: number): Promise<PlanLimits> {
        Log.info(`[SubscriptionService] Checking plan for user: ${userId}`);
        
        // TODO: Viết logic truy vấn CSDL để lấy gói hiện tại của người dùng.
        // Ví dụ: const userPlan = await Subscription.findActivePlanByUserId(userId);
        
        // Mặc định là gói 'free' với các giới hạn cơ bản
        return {
            maxConcurrentJobs: 2,
            options: { can_remove_watermark: false }
        };
    }

    /**
     * Thay đổi gói dịch vụ cho người dùng (sau khi admin duyệt).
     */
    public static async changeUserPlan(userId: number, newPlanId: number): Promise<void> {
        Log.info(`[SubscriptionService] Changing plan for user ${userId} to plan ${newPlanId}`);
        // TODO: Viết logic để cập nhật bảng 'subscriptions'
        // 1. Hủy gói cũ (nếu có)
        // 2. Tạo một subscription mới với plan_id mới và status 'active'
    }
}

export default SubscriptionService;
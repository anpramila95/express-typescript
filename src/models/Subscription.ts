import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';
import { ISubscriptionPlan } from './SubscriptionPlan';
import PricingPlan, { IPricingPlan } from './PricingPlan'; // <-- Chỉ thêm dòng import này

export interface ISubscription {
    id: number;
    user_id: number;
    plan_id: number;
    status: 'active' | 'canceled' | 'expired';
    active_user_id?: number | null;
    expires_at?: Date | null;
}

class Subscription {
    /**
     * Finds the active subscription plan for a user.
     * (Hàm này giữ nguyên, không thay đổi)
     */
    public static async findActivePlanByUserId(userId: number): Promise<ISubscriptionPlan | null> {
        // ... code gốc của hàm này ...
        const sql = `
            SELECT sp.*, s.expires_at
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = ? AND s.status = 'active'
            AND (s.expires_at IS NULL OR s.expires_at > NOW())
            ORDER BY s.expires_at DESC
            LIMIT 1
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
            if (rows.length === 0) {
                return null;
            }
            const plan = rows[0];
            if (plan.options && typeof plan.options === 'string') {
                try {
                    plan.options = JSON.parse(plan.options);
                } catch (error) {
                    Log.error(`[SubscriptionModel] Failed to parse options for plan ID ${plan.id}: ${error.message}`);
                    plan.options = null;
                }
            }
            return plan as ISubscriptionPlan;
        } catch (error) {
            Log.error(`[SubscriptionModel] Error finding active plan for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Deactivates all currently active subscriptions for a user.
     * (Hàm này giữ nguyên, không thay đổi)
     */
    public static async deactivateAllForUser(userId: number): Promise<boolean> {
        // ... code gốc của hàm này ...
        const sql = "UPDATE subscriptions SET status = 'canceled', active_user_id = NULL WHERE user_id = ? AND status = 'active'";
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [userId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[SubscriptionModel] Error deactivating subscriptions for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Creates a new, active subscription for a user based on a specific pricing plan.
     * (Hàm này được cập nhật logic)
     */
    public static async create(data: { userId: number; pricingPlanId: number; }): Promise<{ id: number }> {
        const pricingPlan = await PricingPlan.findById(data.pricingPlanId);
        if (!pricingPlan) {
            throw new Error(`Pricing plan with ID ${data.pricingPlanId} not found.`);
        }

        const sql = `
            INSERT INTO subscriptions (user_id, plan_id, status, active_user_id, expires_at)
            VALUES (?, ?, 'active', ?, NOW() + INTERVAL ? DAY)
        `;
        
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.userId,
                pricingPlan.plan_id,
                data.userId,
                pricingPlan.duration_days
            ]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[SubscriptionModel] Error creating new subscription: ${error.message}`);
            throw error;
        }
    }
}

export default Subscription;
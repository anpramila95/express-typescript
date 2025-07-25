import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';
import { ISubscriptionPlan } from './SubscriptionPlan';

export interface ISubscription {
    id: number;
    user_id: number;
    plan_id: number;
    status: 'active' | 'canceled' | 'expired';
    active_user_id?: number | null; // Added this field
    expires_at?: Date | null;
}

class Subscription {
    /**
     * Finds the active subscription plan for a user.
     * Returns the full plan details with parsed options.
     */
    public static async findActivePlanByUserId(userId: number): Promise<ISubscriptionPlan | null> {
        const sql = `
            SELECT sp.*
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = ? AND s.status = 'active'
            LIMIT 1
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
            if (rows.length === 0) {
                return null;
            }

            const plan = rows[0];

            // Safely parse the options field
            if (plan.options && typeof plan.options === 'string') {
                try {
                    plan.options = JSON.parse(plan.options);
                } catch (error) {
                    Log.error(`[SubscriptionModel] Failed to parse options for plan ID ${plan.id}: ${error.message}`);
                    plan.options = null; // Set to null if parsing fails
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
     * This sets their status to 'canceled' and clears the unique `active_user_id`.
     */
    public static async deactivateAllForUser(userId: number): Promise<boolean> {
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
     * Creates a new, active subscription for a user.
     * It sets `active_user_id` to enforce the unique constraint.
     */
    public static async create(data: { userId: number; planId: number; expires_at?: Date | null }): Promise<{ id: number }> {
        const sql = "INSERT INTO subscriptions (user_id, plan_id, status, active_user_id, expires_at) VALUES (?, ?, 'active', ?, ?)";
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
                data.userId, 
                data.planId, 
                data.userId, // Set active_user_id to the user's ID
                data.expires_at || null 
            ]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[SubscriptionModel] Error creating new subscription: ${error.message}`);
            throw error;
        }
    }
}

export default Subscription;
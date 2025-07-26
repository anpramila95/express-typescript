import Database from '../providers/Database';
import Log from '../middlewares/Log';

interface IAuditLogData {
    siteId: number;
    userId?: number;
    action: string;
    targetType?: string;
    targetId?: number;
    details?: object;
    ipAddress?: string;
}

class AuditLogService {
    public static async log(data: IAuditLogData): Promise<void> {
        const sql = `
            INSERT INTO audit_logs (site_id, user_id, action, target_type, target_id, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        try {
            await Database.pool.execute(sql, [
                data.siteId,
                data.userId,
                data.action || null,
                data.targetType || null,
                data.targetId || null,
                data.details ? JSON.stringify(data.details) : null,
                data.ipAddress || null,
            ]);
        } catch (error) {
            Log.error(`[AuditLogService] Failed to write audit log: ${error}`);
        }
    }
}

export default AuditLogService;
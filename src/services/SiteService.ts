// src/services/SiteService.ts

import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

class SiteService {
    /**
     * Cập nhật các tính năng được phép cho một site.
     * Hàm này sẽ xóa các quyền cũ và thêm lại các quyền mới trong một transaction.
     */
    public static async updateFeatures(siteId: number, featureCodes: string[]): Promise<void> {
        const connection = await Database.pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Xóa tất cả quyền hiện tại của site này
            const deleteQuery = 'DELETE FROM site_features WHERE site_id = ?';
            await connection.execute(deleteQuery, [siteId]);

            // 2. Nếu không có feature code nào được cung cấp, chỉ cần commit và thoát
            if (featureCodes.length === 0) {
                await connection.commit();
                return;
            }

            // 3. Lấy ID của các feature từ mảng code
            const placeholders = featureCodes.map(() => '?').join(',');
            const getFeaturesQuery = `SELECT id FROM features WHERE code IN (${placeholders})`;
            const [featureRows] = await connection.query<mysql.RowDataPacket[]>(getFeaturesQuery, featureCodes);
            
            if (featureRows.length > 0) {
                // 4. Chuẩn bị dữ liệu để insert hàng loạt
                const insertValues = featureRows.map((row: { id: number }) => [siteId, row.id, true]);
                
                // 5. Thêm lại các quyền mới
                const insertQuery = 'INSERT INTO site_features (site_id, feature_id, is_enabled) VALUES ?';
                await connection.query(insertQuery, [insertValues]);
            }

            // Hoàn tất transaction thành công
            await connection.commit();
        } catch (error) {
            // Nếu có lỗi, rollback lại tất cả thay đổi
            await connection.rollback();
            Log.error(`[SiteService] Lỗi khi cập nhật features cho site ID ${siteId}: ${error.stack}`);
            throw new Error("Không thể cập nhật features cho site.");
        } finally {
            // Luôn trả connection về pool sau khi dùng xong
            connection.release();
        }
    }

    /**
     * Kiểm tra xem một site có quyền truy cập một tính năng cụ thể hay không.
     */
    public static async hasFeature(siteId: number, featureCode: string): Promise<boolean> {
        const query = `
            SELECT 1 
            FROM site_features sf
            JOIN features f ON sf.feature_id = f.id
            WHERE sf.site_id = ? AND f.code = ? AND sf.is_enabled = true
            LIMIT 1
        `;
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(query, [siteId, featureCode]);
            return rows.length > 0;
        } catch (error) {
            Log.error(`[SiteService] Lỗi khi kiểm tra feature '${featureCode}' cho site ID ${siteId}: ${error.stack}`);
            // Mặc định trả về false để đảm bảo an toàn
            return false;
        }
    }
}

export default SiteService;
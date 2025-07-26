import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

export interface IRole {
    id: number;
    site_id: number;
    name: string;
    description: string;
}

class Role {
    /**
     * Tạo một vai trò mới trong một Site
     */
    public static async create(siteId: number, name: string, description: string): Promise<{ id: number }> {
        const sql = 'INSERT INTO roles (site_id, name, description) VALUES (?, ?, ?)';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [siteId, name, description]);
            return { id: result.insertId };
        } catch (error) {
            Log.error(`[RoleModel] Lỗi khi tạo vai trò: ${error}`);
            throw error;
        }
    }

    /**
     * Lấy danh sách vai trò của một Site
     */
    public static async findBySiteId(siteId: number): Promise<IRole[]> {
        const sql = 'SELECT * FROM roles WHERE site_id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [siteId]);
            return rows as IRole[];
        } catch (error) {
            Log.error(`[RoleModel] Lỗi khi lấy danh sách vai trò: ${error}`);
            throw error;
        }
    }

    /**
     * Gán một quyền cho một vai trò
     */
    public static async assignPermission(roleId: number, permissionId: number): Promise<boolean> {
        const sql = 'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [roleId, permissionId]);
            return result.affectedRows > 0;
        } catch (error) {
            // Bỏ qua lỗi nếu đã tồn tại
            if (error.code === 'ER_DUP_ENTRY') {
                return true;
            }
            Log.error(`[RoleModel] Lỗi khi gán quyền cho vai trò: ${error}`);
            throw error;
        }
    }

     /**
     * Tìm một vai trò bằng ID
     * @param roleId ID của vai trò cần tìm
     * @returns Role object hoặc null nếu không tìm thấy
     */
    public static async findById(roleId: number): Promise<IRole | null> {
        const sql = 'SELECT * FROM roles WHERE id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [roleId]);
            if (rows.length > 0) {
                return rows[0] as IRole;
            }
            return null;
        } catch (error) {
            Log.error(`[RoleModel] Lỗi khi tìm vai trò bằng ID ${roleId}: ${error}`);
            throw error;
        }
    }
}

export default Role;
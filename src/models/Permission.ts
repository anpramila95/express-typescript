import Database from '../providers/Database';
import Log from '../middlewares/Log';
import type * as mysql from 'mysql2';

export interface IPermission {
    id: number;
    name: string;
    description: string;
}

class Permission {
    /**
     * Lấy tất cả các quyền có trong hệ thống
     */
    public static async listAll(): Promise<IPermission[]> {
        const sql = 'SELECT * FROM permissions ORDER BY name ASC';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql);
            return rows as IPermission[];
        } catch (error) {
            Log.error(`[PermissionModel] Lỗi khi lấy danh sách quyền: ${error}`);
            throw error;
        }
    }

    /**
     * Tạo một quyền mới (dành cho Super Admin)
     */
    public static async create(name: string, description: string): Promise<{ id: number }> {
        const sql = 'INSERT INTO permissions (name, description) VALUES (?, ?)';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [name, description]);
            return { id: result.insertId };
        } catch (error) {
            // Xử lý lỗi nếu tên quyền đã tồn tại (UNIQUE KEY `name_unique`)
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Tên quyền này đã tồnTAIN.');
            }
            Log.error(`[PermissionModel] Lỗi khi tạo quyền: ${error}`);
            throw error;
        }
    }
}

export default Permission;
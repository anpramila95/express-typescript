import Database from '../providers/Database';
import type * as mysql from 'mysql2';

export interface IFolder {
    id: number;
    user_id: number;
    parent_id: number | null;
    name: string;
}

class Folder {
    /**
     * Tạo một thư mục mới cho người dùng.
     */
    public static async create(userId: number, parentId: number | null, name: string): Promise<{ id: number }> {
        const sql = 'INSERT INTO folders (user_id, parent_id, name) VALUES (?, ?, ?)';
        const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [userId, parentId, name]);
        return { id: result.insertId };
    }

    /**
     * Di chuyển nhiều thư mục của người dùng vào một thư mục khác.
     */
    public static async moveMultiple(folderIds: number[], newParentId: number | null, userId: number): Promise<boolean> {
        if (folderIds.length === 0) return true;
        const sql = 'UPDATE folders SET parent_id = ? WHERE id IN (?) AND user_id = ?';
        const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [newParentId, folderIds, userId]);
        return result.affectedRows > 0;
    }

    /**
     * Lấy tất cả thư mục con và file con trong một thư mục của người dùng.
     */
    public static async getContents(userId: number, parentId: number | null): Promise<{ folders: IFolder[], files: any[] }> {
        const folderSql = 'SELECT * FROM folders WHERE user_id = ? AND parent_id <=> ? ORDER BY name ASC';
        const mediaSql = 'SELECT * FROM medias WHERE user_id = ? AND folder_id <=> ? ORDER BY created_at DESC';

        const [folders] = await Database.pool.query<mysql.RowDataPacket[]>(folderSql, [userId, parentId]);
        const [files] = await Database.pool.query<mysql.RowDataPacket[]>(mediaSql, [userId, parentId]);

        return { folders: folders as IFolder[], files };
    }
}

export default Folder;
import Database from '../providers/Database';
import type * as mysql from 'mysql2';

export interface ICreditPackage {
    id: number;
    site_id: number; // Thêm site_id để các gói credit thuộc về site cụ thể
    name: string;
    credits_amount: number;
    price: number;
    currency: string;
}

class CreditPackage {
    public static async findAll(siteId?: number): Promise<ICreditPackage[]> {
        let sql = 'SELECT * FROM credit_packages';
        const params: any[] = [];
        
        if (siteId) {
            sql += ' WHERE site_id = ?';
            params.push(siteId);
        }
        
        sql += ' ORDER BY price ASC';
        
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, params);
        return rows as ICreditPackage[];
    }

    public static async findById(id: number, siteId?: number): Promise<ICreditPackage | null> {
        let sql = 'SELECT * FROM credit_packages WHERE id = ?';
        const params: any[] = [id];
        
        if (siteId) {
            sql += ' AND site_id = ?';
            params.push(siteId);
        }
        
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, params);
        return rows.length > 0 ? (rows[0] as ICreditPackage) : null;
    }
    

    // Thêm method để tạo credit package cho site cụ thể
    public static async create(data: {
        site_id: number;
        name: string;
        credits_amount: number;
        price: number;
        currency: string;
    }): Promise<ICreditPackage> {
        const sql = `
            INSERT INTO credit_packages (site_id, name, credits_amount, price, currency)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [
            data.site_id,
            data.name,
            data.credits_amount,
            data.price,
            data.currency
        ]);
        
        return { id: result.insertId, ...data };
    }

    // Thêm method để update credit package
    public static async update(id: number, siteId: number, data: Partial<Omit<ICreditPackage, 'id' | 'site_id'>>): Promise<boolean> {
        const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
        const values = Object.values(data);

        const sql = `UPDATE credit_packages SET ${fields} WHERE id = ? AND site_id = ?`;
        
        const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [...values, id, siteId]);
        return result.affectedRows > 0;
    }

    // Thêm method để delete credit package
    public static async delete(id: number, siteId: number): Promise<boolean> {
        const sql = 'DELETE FROM credit_packages WHERE id = ? AND site_id = ?';
        const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [id, siteId]);
        return result.affectedRows > 0;
    }
}

export default CreditPackage;
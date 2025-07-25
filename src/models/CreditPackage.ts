import Database from '../providers/Database';
import type * as mysql from 'mysql2';

export interface ICreditPackage {
    id: number;
    name: string;
    credits_amount: number;
    price: number;
    currency: string;
}

class CreditPackage {
    public static async findAll(): Promise<ICreditPackage[]> {
        const sql = 'SELECT * FROM credit_packages ORDER BY price ASC';
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql);
        return rows as ICreditPackage[];
    }

    public static async findById(id: number): Promise<ICreditPackage | null> {
        const sql = 'SELECT * FROM credit_packages WHERE id = ?';
        const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [id]);
        return rows.length > 0 ? (rows[0] as ICreditPackage) : null;
    }
}

export default CreditPackage;
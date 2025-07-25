/**
 * Model để quản lý credit của người dùng
 *
 * @author Your Name <you@example.com>
 */

import Database from '../providers/Database';
import Log from '../middlewares/Log';
import Locals from '../providers/Locals';
import type * as mysql from 'mysql2';

// Interface định nghĩa cấu trúc của một bản ghi credit
// Giả định bạn có một bảng `user_credits` với các cột này
export interface IUserCredit {
    id?: number;
    user_id: number;
    credits: number;
    updated_at?: Date;
}

// Định nghĩa cấu trúc credit mặc định từ config
interface IDefaultCredits {
    image: number;
    video: number;
    tts: number;
    'image-to-video': number;
    // Thêm các loại khác nếu có
}


class UserCredit {
    
    /**
     * Lấy thông tin credit mặc định từ cấu hình.
     * Tương đương với `config('SocialHub')->defaultCredits` trong PHP.
     */
    private static getDefaultCredits(): IDefaultCredits {
        // Trong một ứng dụng thực tế, bạn có thể tách phần này ra một file config riêng
        // Ở đây, chúng ta lấy trực tiếp từ Locals provider
        const config = Locals.config();
        return {
            image: config.creditCosts?.image || 1, // Giá trị mặc định là 1 nếu không được định nghĩa
            video: config.creditCosts?.video || 5,
            tts: config.creditCosts?.tts || 1,
            'image-to-video': config.creditCosts?.imageToVideo || 3
        };
    }

    /**
     * Lấy số credit cần thiết cho một hành động cụ thể.
     * @param type Loại hành động (ví dụ: 'image', 'video')
     * @returns Số credit cần thiết
     */
    public static getRequiredCreditsFor(type: string): number {
        const defaultCredits = this.getDefaultCredits();
        return defaultCredits[type] || 1; // Mặc định là 1 nếu không tìm thấy
    }

    /**
     * Tìm thông tin credit của một người dùng bằng user_id.
     * @param userId - ID của người dùng
     * @returns Thông tin credit hoặc null nếu không tìm thấy
     */
    public static async findByUserId(userId: number): Promise<IUserCredit | null> {
        const sql = 'SELECT * FROM user_credits WHERE user_id = ?';
        try {
            const [rows] = await Database.pool.query<mysql.RowDataPacket[]>(sql, [userId]);
            if (rows.length > 0) {
                return rows[0] as IUserCredit;
            }
            return null;
        } catch (error) {
            Log.error(`[UserCreditModel] Error finding credits for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Kiểm tra xem người dùng có đủ credit hay không.
     * @param userId - ID của người dùng
     * @param amountToDeduct - Số credit cần để thực hiện hành động
     * @returns `true` nếu đủ, `false` nếu không đủ
     */
    public static async hasEnough(userId: number, amountToDeduct: number): Promise<boolean> {
        try {
            const userCredit = await this.findByUserId(userId);
            if (userCredit && userCredit.credits >= amountToDeduct) {
                return true;
            }
            return false;
        } catch (error) {
            // Lỗi xảy ra cũng được coi là không đủ credit để đảm bảo an toàn
            Log.error(`[UserCreditModel] Could not verify credits for user ${userId}: ${error.stack}`);
            return false;
        }
    }

    /**
     * Trừ credit của người dùng.
     * Hàm này thực hiện một transaction để đảm bảo tính toàn vẹn dữ liệu.
     * @param userId - ID của người dùng
     * @param amountToDeduct - Số credit cần trừ
     * @returns `true` nếu trừ thành công, `false` nếu thất bại
     */
    public static async deduct(userId: number, amountToDeduct: number): Promise<boolean> {
        if (amountToDeduct <= 0) return true; // Không trừ nếu số lượng là 0 hoặc âm

        const connection = await Database.pool.getConnection();
        try {
            await connection.beginTransaction();

            // Lấy dòng dữ liệu và khóa nó lại để tránh race condition
            const selectSql = 'SELECT credits FROM user_credits WHERE user_id = ? FOR UPDATE';
            const [rows] = await connection.query<mysql.RowDataPacket[]>(selectSql, [userId]);

            if (rows.length === 0 || rows[0].credits < amountToDeduct) {
                await connection.rollback(); // Hoàn tác nếu không có user hoặc không đủ credit
                return false;
            }

            // Thực hiện trừ credit
            const newCreditAmount = rows[0].credits - amountToDeduct;
            const updateSql = 'UPDATE user_credits SET credits = ? WHERE user_id = ?';
            await connection.execute(updateSql, [newCreditAmount, userId]);

            await connection.commit(); // Lưu thay đổi
            return true;

        } catch (error) {
            await connection.rollback(); // Hoàn tác nếu có lỗi
            Log.error(`[UserCreditModel] Failed to deduct credits for user ${userId}: ${error.stack}`);
            throw error; // Ném lỗi ra ngoài để controller có thể xử lý
        } finally {
            connection.release(); // Luôn trả connection về pool
        }
    }

    /**
     * Cộng credit cho người dùng (ví dụ: khi họ nạp tiền).
     * @param userId - ID của người dùng
     * @param amountToAdd - Số credit cần cộng
     * @returns `true` nếu cộng thành công, `false` nếu thất bại
     */
    public static async add(userId: number, amountToAdd: number): Promise<boolean> {
        if (amountToAdd <= 0) return true;

        const sql = 'UPDATE user_credits SET credits = credits + ? WHERE user_id = ?';
        try {
            const [result] = await Database.pool.execute<mysql.ResultSetHeader>(sql, [amountToAdd, userId]);
            return result.affectedRows > 0;
        } catch (error) {
            Log.error(`[UserCreditModel] Failed to add credits for user ${userId}: ${error.stack}`);
            throw error;
        }
    }
}

export default UserCredit;
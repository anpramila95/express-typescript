import { Request, Response } from 'express';
import AffiliateEarning from '../../models/AffiliateEarning';
import WithdrawalRequest from '../../models/WithdrawalRequest';

import Log from '../../middlewares/Log';

interface AuthenticatedUser {
    id: number;
}

class AffiliateController {
    /**
     * Lấy lịch sử nhận hoa hồng của người dùng đã đăng nhập (có phân trang).
     */
    public static async getEarningsHistory(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        
        // Lấy các tham số phân trang từ query string (ví dụ: /api/affiliate/history?page=2&limit=20)
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 15; // Mặc định 15 mục mỗi trang
        const offset = (page - 1) * limit;

        try {
            const { items, total } = await AffiliateEarning.findAllForUser(user.id, { limit, offset });

            const totalPages = Math.ceil(total / limit);

            // Trả về dữ liệu kèm thông tin phân trang
            return res.json({
                items,
                pager: {
                    currentPage: page,
                    perPage: limit,
                    totalItems: total,
                    totalPages: totalPages
                }
            });

        } catch (error) {
            Log.error(`Lỗi khi lấy lịch sử hoa hồng: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }


    /**
     * Lấy thông tin tổng quan affiliate (tổng thu nhập, đã rút, số dư).
     */
    public static async getSummary(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        try {
            const [totalEarnings, totalWithdrawn] = await Promise.all([
                AffiliateEarning.getTotalEarnings(user.id),
                AffiliateEarning.getTotalWithdrawn(user.id)
            ]);
            const availableBalance = totalEarnings - totalWithdrawn;
            return res.json({ totalEarnings, totalWithdrawn, availableBalance });
        } catch (error) {
            Log.error(`Lỗi khi lấy summary affiliate: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }

    /**
     * Gửi yêu cầu rút tiền.
     */
    public static async requestWithdrawal(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { amount, paymentDetails } = req.body;

        if (!amount || amount <= 0 || !paymentDetails) {
            return res.status(400).json({ error: 'Vui lòng cung cấp số tiền và thông tin thanh toán.' });
        }

        try {
            const [totalEarnings, totalWithdrawn] = await Promise.all([
                AffiliateEarning.getTotalEarnings(user.id),
                AffiliateEarning.getTotalWithdrawn(user.id)
            ]);
            const availableBalance = totalEarnings - totalWithdrawn;

            if (amount > availableBalance) {
                return res.status(400).json({ error: 'Số tiền yêu cầu vượt quá số dư hiện có.' });
            }

            await WithdrawalRequest.create({ userId: user.id, amount, paymentDetails });
            return res.status(201).json({ message: 'Yêu cầu rút tiền của bạn đã được gửi và đang chờ xử lý.' });
        } catch (error) {
            Log.error(`Lỗi khi tạo yêu cầu rút tiền: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }

    /**
     * Lấy lịch sử yêu cầu rút tiền của người dùng đã đăng nhập.
     */
    public static async getWithdrawalHistory(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { page = 1, limit = 15 } = req.query;
        const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

        try {
            const { items, total } = await WithdrawalRequest.findAll({
                userId: user.id,
                limit: parseInt(limit as string, 10),
                offset
            });

            return res.json({
                items,
                pager: {
                    currentPage: parseInt(page as string, 10),
                    perPage: parseInt(limit as string, 10),
                    totalItems: total,
                    totalPages: Math.ceil(total / parseInt(limit as string, 10))
                }
            });
        } catch (error) {
            Log.error(`Lỗi khi lấy lịch sử rút tiền của người dùng: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ.' });
        }
    }
    
}

export default AffiliateController;
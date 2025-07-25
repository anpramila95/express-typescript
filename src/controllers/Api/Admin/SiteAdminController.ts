import { Request, Response } from "express";
import BlockedUser from "../../../models/BlockedUser";
import Log from "../../../middlewares/Log";
import User from "../../../models/User";
import Site from "../../../models/Site"; // Dùng để lấy siteId từ hostname

interface AuthenticatedAdmin {
    id: number;
}

class SiteAdminController {
    //get all users
    public static async getAllUsers(
        req: Request,
        res: Response
    ): Promise<Response> {
        const admin = req.user as unknown as AuthenticatedAdmin;
        const { limit = '60', page = '1', keyword = '', status = 'blocked' } = req.query;
        const domain = req.hostname;
        // Lấy thông tin site từ domain để có siteId
        const site = await Site.findByDomain(domain); // Bạn cần thêm hàm findByDomain vào Site model
        if (!site) {
            return res.status(404).json({ error: "Không tìm thấy trang web." });
        }
        try {
            const keywordStr = typeof keyword === 'string' ? keyword : '';
            const { users, total } = await User.findAllBySiteId(Number(site.id), keywordStr, Number(page), Number(limit));  
            return res.json({
                items: users.map(user => ({
                    id: user.id,
                    email: user.email,
                    fullname: user.fullname,
                    lastLogin: user.last_login,
                    isAdmin: user.isAdmin,
                    affiliateId: user.affiliate_id,
                    siteId: user.site_id,
                    //check last_login to determine if user is online
                    isOnline: user.last_login ? (new Date().getTime() - new Date(user.last_login).getTime()) < 5 * 60 * 1000 : false, // Online if last login was within the last 5 minutes
                })),
                pager: {
                    currentPage: Number(page),
                    perPage: Number(limit),
                    totalItems: total,
                    totalPages: Math.ceil(total / Number(limit)),
                }
            });
        } catch (error) {
            Log.error(`Lỗi khi lấy danh sách người dùng: ${error.stack}`);
            return res.status(500).json({ error: "Đã xảy ra lỗi hệ thống." });
        }
    }

    /**
     * Khóa một người dùng khỏi trang web hiện tại.
     */
    public static async blockUser(
        req: Request,
        res: Response
    ): Promise<Response> {
        const admin = req.user as unknown as AuthenticatedAdmin;
        const { userIdToBlock, reason } = req.body;
        const domain = req.hostname;

        if (!userIdToBlock) {
            return res
                .status(400)
                .json({ error: "Vui lòng cung cấp ID người dùng cần khóa." });
        }

        try {
            // Lấy thông tin site từ domain để có siteId
            const site = await Site.findByDomain(domain); // Bạn cần thêm hàm findByDomain vào Site model
            if (!site) {
                return res.status(404).json({ error: "Không tìm thấy trang web." });
            }

            // Admin không thể tự khóa chính mình
            if (admin.id === userIdToBlock) {
                return res
                    .status(400)
                    .json({ error: "Bạn không thể tự khóa chính mình." });
            }

            await BlockedUser.block({
                siteId: site.id,
                userId: userIdToBlock,
                adminId: admin.id,
                reason,
            });

            return res.json({
                message: `Đã khóa thành công người dùng ID ${userIdToBlock}.`,
            });
        } catch (error) {
            Log.error(`Lỗi khi admin khóa người dùng: ${error.stack}`);
            return res.status(500).json({ error: "Đã xảy ra lỗi hệ thống." });
        }
    }

    /**
     * Mở khóa cho một người dùng trên trang web hiện tại.
     */
    public static async unblockUser(
        req: Request,
        res: Response
    ): Promise<Response> {
        const { userIdToUnblock } = req.body;
        const domain = req.hostname;

        if (!userIdToUnblock) {
            return res
                .status(400)
                .json({ error: "Vui lòng cung cấp ID người dùng cần mở khóa." });
        }

        try {
            const site = await Site.findByDomain(domain);
            if (!site) {
                return res.status(404).json({ error: "Không tìm thấy trang web." });
            }

            const success = await BlockedUser.unblock(site.id, userIdToUnblock);
            if (success) {
                return res.json({
                    message: `Đã mở khóa thành công cho người dùng ID ${userIdToUnblock}.`,
                });
            } else {
                return res
                    .status(404)
                    .json({
                        error:
                            "Người dùng này không bị khóa hoặc đã được mở khóa trước đó.",
                    });
            }
        } catch (error) {
            Log.error(`Lỗi khi admin mở khóa người dùng: ${error.stack}`);
            return res.status(500).json({ error: "Đã xảy ra lỗi hệ thống." });
        }
    }
}

export default SiteAdminController;

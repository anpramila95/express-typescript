import { Request, Response } from "express";
import BlockedUser from "../../../models/BlockedUser";
import Log from "../../../middlewares/Log";
import User from "../../../models/User";
import Site, { ISite } from "../../../models/Site"; // Dùng để lấy siteId từ hostname
import SubscriptionPlan from '../../../models/SubscriptionPlan'; // <-- Import
import PricingPlan from '../../../models/PricingPlan';         // <-- Import
import DiscountCode from '../../../models/DiscountCode'; // <-- Import
import SiteUtils from '../../../utils/SiteUtils'; // <-- Import SiteUtils


interface AuthenticatedAdmin {
    isAdmin: any;
    id: number;
}

class SiteAdminController {
    //get all users
    public static async getAllUsers(
        req: Request,
        res: Response
    ): Promise<Response> {
        
        const {
            limit = "60",
            page = "1",
            keyword = "",
            status = "blocked",
        } = req.query;
        const admin = req.user as unknown as AuthenticatedAdmin;
        // Lấy thông tin site từ domain để có siteId
        const site = req.site as ISite;

        if(!admin.isAdmin || admin.id != site.user_id) {
            return res.status(403).json({ error: "Bạn không có quyền truy cập vào chức năng này." });
        }
        try {
            const keywordStr = typeof keyword === "string" ? keyword : "";
            const { users, total } = await User.findAllBySiteId(
                Number(site.id),
                keywordStr,
                Number(page),
                Number(limit)
            );
            return res.json({
                items: users.map((user) => ({
                    id: user.id,
                    email: user.email,
                    fullname: user.fullname,
                    lastLogin: user.last_login,
                    isAdmin: user.isAdmin,
                    affiliateId: user.affiliate_id,
                    siteId: user.site_id,
                    //check last_login to determine if user is online
                    isOnline: user.last_login
                        ? new Date().getTime() - new Date(user.last_login).getTime() <
                        5 * 60 * 1000
                        : false, // Online if last login was within the last 5 minutes
                })),
                pager: {
                    currentPage: Number(page),
                    perPage: Number(limit),
                    totalItems: total,
                    totalPages: Math.ceil(total / Number(limit)),
                },
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

        if (!userIdToBlock) {
            return res
                .status(400)
                .json({ error: "Vui lòng cung cấp ID người dùng cần khóa." });
        }

        try {

            const site = req.site as ISite;

            // Chỉ admin mới có quyền thay đổi mật khẩu của người dùng khác
            if ((admin.id !== userIdToBlock && !admin.isAdmin) || admin.id != site.user_id) {
                return res
                    .status(403)
                    .json({
                        error: "Bạn không thể tự khóa chính mình.",
                    });
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
        const admin = req.user as unknown as AuthenticatedAdmin;

        if (!userIdToUnblock) {
            return res
                .status(400)
                .json({ error: "Vui lòng cung cấp ID người dùng cần mở khóa." });
        }

        try {
            const site = req.site as ISite;


            // Chỉ admin mới có quyền thay đổi mật khẩu của người dùng khác
            if ((admin.id === userIdToUnblock && !admin.isAdmin) || admin.id != site.user_id) {
                return res
                    .status(403)
                    .json({
                        error: "Bạn không có quyền thay đổi mật khẩu của người dùng này.",
                    });
            }

            const success = await BlockedUser.unblock(site.id, userIdToUnblock);
            if (success) {
                return res.json({
                    message: `Đã mở khóa thành công cho người dùng ID ${userIdToUnblock}.`,
                });
            } else {
                return res.status(404).json({
                    error: "Người dùng này không bị khóa hoặc đã được mở khóa trước đó.",
                });
            }
        } catch (error) {
            Log.error(`Lỗi khi admin mở khóa người dùng: ${error.stack}`);
            return res.status(500).json({ error: "Đã xảy ra lỗi hệ thống." });
        }
    }

    //change Password
    public static async changePassword(
        req: Request,
        res: Response
    ): Promise<Response> {
        const { userId, newPassword } = req.body;
        const admin = req.user as unknown as AuthenticatedAdmin;

        if (!userId || !newPassword) {
            return res
                .status(400)
                .json({ error: "Cần cung cấp userId và mật khẩu mới." });
        }

        // Lấy thông tin site từ domain để có siteId
        const site = req.site as ISite;

        try {
            // Kiểm tra xem người dùng có tồn tại không
            const user = await User.findById(userId, site.id);
            if (!user) {
                return res.status(404).json({ error: "Không tìm thấy người dùng." });
            }

            // Chỉ admin mới có quyền thay đổi mật khẩu của người dùng khác
            if ((admin.id !== user.id && !admin.isAdmin) || admin.id != site.user_id) {
                return res
                    .status(403)
                    .json({
                        error: "Bạn không có quyền thay đổi mật khẩu của người dùng này.",
                    });
            }

            // Cập nhật mật khẩu
            await User.changePassword(newPassword, userId);
            return res.json({ message: "Mật khẩu đã được cập nhật thành công." });
        } catch (error) {
            Log.error(`Lỗi khi admin thay đổi mật khẩu người dùng: ${error.stack}`);
            return res.status(500).json({ error: "Đã xảy ra lỗi hệ thống." });
        }
    }

    /** start subscription */
    //getAllSubscriptionPlans
    public static async getAllSubscriptionPlans(
        req: Request,
        res: Response
    ): Promise<Response> {
        const admin = req.user as unknown as AuthenticatedAdmin;

        try {
            // Sử dụng SiteUtils để get siteId và check permissions
            const siteId = SiteUtils.getSiteId(req);
            const hasAccess = await SiteUtils.hasAdminAccess(req, admin.id, admin.isAdmin);

            if (!hasAccess) {
                return res.status(403).json({ error: "Bạn không có quyền truy cập vào chức năng này." });
            }

            // Log action với site context
            SiteUtils.logWithSiteContext(req, `Admin ${admin.id} requested subscription plans`);

            const plans = await SubscriptionPlan.findAll({
                siteId: siteId
            });
            
            return res.json(plans);
        } catch (error) {
            Log.error(`Lỗi khi lấy danh sách gói dịch vụ: ${error.stack}`);
            return res.status(500).json({ error: "Đã xảy ra lỗi hệ thống." });
        }
    }

    //getAllPricingPlans

    public static async getAllPricingPlans(
        req: Request,
        res: Response
    ): Promise<Response> {
        const admin = req.user as unknown as AuthenticatedAdmin;

        // Lấy thông tin site từ domain để có siteId
        const site = req.site as ISite;
        const planId = req.query.planId ? Number(req.query.planId) : null;

        try {
            const pricingPlans = await PricingPlan.findAllByPlanId(planId, site.id); // Thêm site.id để filter theo site
            return res.json(pricingPlans);
        } catch (error) {
            Log.error(`Lỗi khi lấy danh sách gói giá: ${error.stack}`);
            return res.status(500).json({ error: "Đã xảy ra lỗi hệ thống." });
        }
    }
    /**
     * Admin tạo một gói dịch vụ (Subscription Plan) mới.
     */
    public static async createSubscriptionPlan(req: Request, res: Response): Promise<Response> {
        const { name, description, max_concurrent_jobs, options } = req.body;
        const admin = req.user as unknown as AuthenticatedAdmin;
        const site = req.site as ISite;

        // Kiểm tra quyền
        if(!admin.isAdmin || admin.id != site.user_id) {
            return res.status(403).json({ error: "Bạn không có quyền truy cập vào chức năng này." });
        }

        if (!name || max_concurrent_jobs === undefined) {
            return res.status(400).json({ error: 'Tên gói (name) và giới hạn công việc (max_concurrent_jobs) là bắt buộc.' });
        }

        try {
            const newPlan = await SubscriptionPlan.create({
                site_id: site.id, // Thêm site_id
                name,
                description,
                max_concurrent_jobs,
                options
            });
            return res.status(201).json(newPlan);
        } catch (error) {
            Log.error(`Lỗi khi admin tạo Subscription Plan: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ khi tạo gói dịch vụ.' });
        }
    }

    /**
     * Admin tạo một tùy chọn giá (Pricing Plan) mới cho một gói dịch vụ đã có.
     */
    public static async createPricingPlan(req: Request, res: Response): Promise<Response> {
        const { plan_id, name, price, currency = 'VND', duration_days, start_date, end_date } = req.body;
        const admin = req.user as unknown as AuthenticatedAdmin;
        const site = req.site as ISite;

        // Kiểm tra quyền
        if(!admin.isAdmin || admin.id != site.user_id) {
            return res.status(403).json({ error: "Bạn không có quyền truy cập vào chức năng này." });
        }

        if (!plan_id || !name || price === undefined || !duration_days) {
            return res.status(400).json({ error: 'plan_id, name, price, và duration_days là bắt buộc.' });
        }

        try {
            // Kiểm tra xem plan_id có tồn tại và thuộc về site này không
            const subscriptionPlan = await SubscriptionPlan.findByIdAndSite(plan_id, site.id);
            if (!subscriptionPlan) {
                return res.status(404).json({ error: `Không tìm thấy gói dịch vụ với ID: ${plan_id} trong site này.` });
            }

            const newPricingPlan = await PricingPlan.create({
                plan_id,
                site_id: site.id, // Thêm site_id
                name,
                price,
                currency,
                duration_days,
                start_date: start_date ? new Date(start_date) : undefined,
                end_date: end_date ? new Date(end_date) : undefined,
            });

            return res.status(201).json(newPricingPlan);
        } catch (error) {
            Log.error(`Lỗi khi admin tạo Pricing Plan: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ khi tạo gói giá.' });
        }
    }

    public static async createDiscountCode(req: Request, res: Response): Promise<Response> {
        const { code, discount_type, discount_value, description, max_uses, expires_at } = req.body;
        const admin = req.user as unknown as AuthenticatedAdmin;
        const site = req.site as ISite;

        // Kiểm tra quyền
        if(!admin.isAdmin || admin.id != site.user_id) {
            return res.status(403).json({ error: "Bạn không có quyền truy cập vào chức năng này." });
        }

        if (!code || !discount_type || discount_value === undefined) {
            return res.status(400).json({ error: 'code, discount_type, và discount_value là bắt buộc.' });
        }
        if (!['percentage', 'fixed_amount'].includes(discount_type)) {
            return res.status(400).json({ error: 'discount_type phải là "percentage" hoặc "fixed_amount".' });
        }

        try {
            const newCode = await DiscountCode.create({
                site_id: site.id, // Thêm site_id
                code,
                discount_type,
                discount_value,
                description,
                max_uses,
                expires_at: expires_at ? new Date(expires_at) : undefined,
            });
            return res.status(201).json(newCode);
        } catch (error) {
            // Xử lý lỗi trùng lặp mã
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: `Mã "${code}" đã tồn tại.` });
            }
            Log.error(`Lỗi khi admin tạo mã giảm giá: ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ khi tạo mã giảm giá.' });
        }
    }
}

export default SiteAdminController;

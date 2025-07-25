/**
 * Define all your API web-routes
 *
 * @author Faiz A. Farooqui <faiz@geekyants.com>
 */

import { Router } from 'express';
import * as expressJwt from 'express-jwt';

import Locals from '../providers/Locals';
import * as multer from 'multer';
import LoginController from '../controllers/Api/Auth/Login';
import RegisterController from '../controllers/Api/Auth/Register';
import RefreshTokenController from '../controllers/Api/Auth/RefreshToken';
import MediaController from '../controllers/Api/MediaController'; // Import the new controller
import PlanController from '../controllers/Api/PlanController';
import CreditController from '../controllers/Api/CreditController';
import ApprovalController from '../controllers/Api/Admin/ApprovalController';
import TransactionController from '../controllers/Api/TransactionController';
import AccountInfoController from '../controllers/Api/AccountInfoController';
import FlexibleAuthMiddleware from '../middlewares/FlexibleAuthMiddleware'; // <-- Import middleware mới
import ApiKeyController from '../controllers/Api/ApiKeyController'; // <-- Import controller mới
import SiteAdminController from '../controllers/Api/Admin/SiteAdminController';
import AffiliateController from '../controllers/Api/AffiliateController'; // <-- Import controller mới


const router = Router();
// --- Public Routes ---
router.post('/auth/login', LoginController.perform);
router.post('/auth/register', RegisterController.perform);
router.post('/auth/refresh-token', expressJwt({ secret: Locals.config().appSecret }), RefreshTokenController.perform);


// --- API Key Management Routes ---
router.get('/keys', FlexibleAuthMiddleware.authenticate, ApiKeyController.listKeys);
router.post('/keys', FlexibleAuthMiddleware.authenticate, ApiKeyController.createKey);
router.delete('/keys/:keyId', FlexibleAuthMiddleware.authenticate, ApiKeyController.revokeKey);


// Configure Multer for file uploads
const upload = multer({ dest: 'public/uploads/' }); // Configure your upload destination

// --- Media Routes ---
// These routes are protected and require a valid JWT
router.get('/media', FlexibleAuthMiddleware.authenticate, MediaController.getAll);
router.post('/media/upload', FlexibleAuthMiddleware.authenticate, upload.single('file'), MediaController.upload);
router.post('/media/import', FlexibleAuthMiddleware.authenticate, MediaController.importVideo);
router.delete('/media/:id', FlexibleAuthMiddleware.authenticate, MediaController.delete);
router.post('/media/gen-ai', FlexibleAuthMiddleware.authenticate, MediaController.generateAi);

//account ìno
router.get('/account/info', FlexibleAuthMiddleware.authenticate, AccountInfoController.getInfo); // <-- Route mới

// plans 
router.get('/plans', FlexibleAuthMiddleware.authenticate, PlanController.listPlans);
router.get('/credit-packages', FlexibleAuthMiddleware.authenticate, CreditController.listPackages);

router.post('/plans/request-upgrade', FlexibleAuthMiddleware.authenticate, PlanController.requestUpgrade);
router.post('/credits/request-purchase', FlexibleAuthMiddleware.authenticate, CreditController.requestPurchase);
router.get('/transactions/:transactionId', FlexibleAuthMiddleware.authenticate, TransactionController.getDetails);
router.get('/transactions', FlexibleAuthMiddleware.authenticate, TransactionController.findAll);


/// afiliate
// --- Affiliate Routes ---
router.get('/affiliate/history', FlexibleAuthMiddleware.authenticate, AffiliateController.getEarningsHistory);
router.get('/affiliate/summary', FlexibleAuthMiddleware.authenticate, AffiliateController.getSummary);
router.post('/affiliate/request-withdrawal', FlexibleAuthMiddleware.authenticate, AffiliateController.requestWithdrawal);
router.get('/affiliate/withdrawals', FlexibleAuthMiddleware.authenticate, AffiliateController.getWithdrawalHistory); // <-- Route mới cho người dùng


// == ADMIN-ONLY ROUTES ==
const adminRouter = Router();
// Bạn cần tạo middleware AdminMiddleware.isAdmin để kiểm tra quyền admin của user
//adminRouter.use(AdminMiddleware.isAdmin); 

// Route để quản lý các yêu cầu đang chờ xử lý
adminRouter.get('/transactions/pending', ApprovalController.listPending);
adminRouter.post('/transactions/:transactionId/approve', ApprovalController.approvePending);
adminRouter.post('/transactions/:transactionId/reject', ApprovalController.rejectPending);

// Route để admin tự thực hiện hành động (không qua yêu cầu)
adminRouter.post('/users/assign-subscription', ApprovalController.assignSubscription);
adminRouter.post('/users/give-credits', ApprovalController.giveCredits);
// Route để khóa và mở khóa người dùng
adminRouter.post('/users/block', SiteAdminController.blockUser);
adminRouter.get('/users', SiteAdminController.getAllUsers);
adminRouter.post('/users/unblock', SiteAdminController.unblockUser);

//affiliates
// --- Withdrawal Management Routes ---
adminRouter.get('/withdrawals', ApprovalController.listWithdrawals); // <-- Thay thế route cũ
adminRouter.get('/withdrawals/pending', ApprovalController.listPendingWithdrawals);
adminRouter.get('/withdrawals/:requestId', ApprovalController.getWithdrawalDetails); // <-- Route mới
adminRouter.post('/withdrawals/:requestId/process', ApprovalController.processWithdrawal);

// Gắn router của admin vào /api/admin
router.use('/admin', FlexibleAuthMiddleware.authenticate, adminRouter);

export default router;

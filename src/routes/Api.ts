/**
 * Define all your API web-routes
 *
 * @author Faiz A. Farooqui <faiz@geekyants.com>
 */

import { Router } from 'express';
import * as expressJwt from 'express-jwt';

import Locals from '../providers/Locals';
import * as multer from 'multer';
import HomeController from '../controllers/Api/Home';
import LoginController from '../controllers/Api/Auth/Login';
import RegisterController from '../controllers/Api/Auth/Register';
import RefreshTokenController from '../controllers/Api/Auth/RefreshToken';
import MediaController from '../controllers/Api/MediaController'; // Import the new controller
import PlanController from '../controllers/Api/PlanController';
import CreditController from '../controllers/Api/CreditController';
import ApprovalController from '../controllers/Api/Admin/ApprovalController';
import AdminMiddleware from '../middlewares/Admin'; // Import the admin middleware
import TransactionController from '../controllers/Api/TransactionController';
import AccountInfoController from '../controllers/Api/AccountInfoController';


const router = Router();
// --- Public Routes ---
router.post('/auth/login', LoginController.perform);
router.post('/auth/register', RegisterController.perform);
router.post('/auth/refresh-token', expressJwt({ secret: Locals.config().appSecret }), RefreshTokenController.perform);


// Configure JWT Middleware
const checkAuth = expressJwt({ secret: Locals.config().appSecret, algorithms: ['HS256'] });
console.log('JWT Middleware configured with secret:', checkAuth);
// Configure Multer for file uploads
const upload = multer({ dest: 'public/uploads/' }); // Configure your upload destination

// --- Media Routes ---
// These routes are protected and require a valid JWT
router.get('/media', checkAuth, MediaController.getAll);
router.post('/media/upload', checkAuth, upload.single('file'), MediaController.upload);
router.post('/media/import', checkAuth, MediaController.importVideo);
router.delete('/media/:id', checkAuth, MediaController.delete);
router.post('/media/gen-ai', checkAuth, MediaController.generateAi);

router.get('/account/info', checkAuth, AccountInfoController.getInfo); // <-- Route mới

router.get('/plans', PlanController.listPlans);
router.get('/credit-packages', CreditController.listPackages);


// == USER AUTHENTICATED ROUTES ==
router.post('/plans/request-upgrade', checkAuth, PlanController.requestUpgrade);
router.post('/credits/request-purchase', checkAuth, CreditController.requestPurchase);
router.get('/transactions/:transactionId', checkAuth, TransactionController.getDetails);
router.get('/transactions', checkAuth, TransactionController.findAll);

// == ADMIN-ONLY ROUTES ==
const adminRouter = Router();
// Bạn cần tạo middleware AdminMiddleware.isAdmin để kiểm tra quyền admin của user
// adminRouter.use(AdminMiddleware.isAdmin); 

adminRouter.use(AdminMiddleware.isAdmin);

// Route để quản lý các yêu cầu đang chờ xử lý
adminRouter.get('/transactions/pending', ApprovalController.listPending);
adminRouter.post('/transactions/:transactionId/approve', ApprovalController.approvePending);
adminRouter.post('/transactions/:transactionId/reject', ApprovalController.rejectPending);

// Route để admin tự thực hiện hành động (không qua yêu cầu)
adminRouter.post('/users/assign-subscription', ApprovalController.assignSubscription);
adminRouter.post('/users/give-credits', ApprovalController.giveCredits);

// Gắn router của admin vào /api/admin
router.use('/admin', checkAuth, adminRouter);

export default router;

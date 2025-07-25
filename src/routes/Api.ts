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



const router = Router();

router.get('/', HomeController.index);

router.post('/auth/login', (req, res, next) => LoginController.perform(req, res, next));
router.post('/auth/register', (req, res, next) => RegisterController.perform(req, res, next));
router.post('/auth/refresh-token', expressJwt({ secret: Locals.config().appSecret }), RefreshTokenController.perform);


// Configure JWT Middleware
const checkAuth = expressJwt({ secret: Locals.config().appSecret, algorithms: ['HS256'] });
// Configure Multer for file uploads
const upload = multer({ dest: 'public/uploads/' }); // Configure your upload destination

// --- Media Routes ---
// These routes are protected and require a valid JWT
router.get('/media', checkAuth, MediaController.getAll);
router.post('/media/upload', checkAuth, upload.single('file'), MediaController.upload);
router.post('/media/import', checkAuth, MediaController.importVideo);
router.delete('/media/:id', checkAuth, MediaController.delete);
router.post('/media/gen-ai', checkAuth, MediaController.generateAi);



// --- USER-FACING ROUTES ---
// Lấy danh sách các gói
router.get('/plans', PlanController.listPlans);
router.get('/credit-packages', CreditController.listPackages);

// Gửi yêu cầu (cần đăng nhập)
router.post('/plans/request-upgrade', checkAuth, PlanController.requestUpgrade);
router.post('/credits/request-purchase', checkAuth, CreditController.requestPurchase);

// --- ADMIN-ONLY ROUTES ---
// Giả sử bạn có một middleware `AdminMiddleware.isAdmin` để bảo vệ các route này
const adminRouter = Router();
adminRouter.get('/requests/pending', ApprovalController.listPendingRequests);
adminRouter.post('/requests/upgrade/:requestId/approve', ApprovalController.approveUpgrade);
adminRouter.post('/requests/purchase/:requestId/approve', ApprovalController.approvePurchase);
adminRouter.post('/requests/:type/:requestId/reject', ApprovalController.rejectRequest);

// Gắn router của admin vào một prefix riêng, ví dụ: /api/admin
router.use('/admin', checkAuth, /* AdminMiddleware.isAdmin, */ adminRouter);

export default router;

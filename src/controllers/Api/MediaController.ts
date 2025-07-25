/**
 * Controller xử lý các yêu cầu API liên quan đến Media
 *
 * @author Your Name <you@example.com>
 */

import { Request, Response } from 'express';
import axios from 'axios'; // Dùng để gọi API ngoài (thay thế cho curlData)
import Media, { IMedia } from '../../models/Media';
import UserCredit from '../../models/UserCredit'; // Import model UserCredit
import Queue from '../../providers/Queue'; // Hệ thống hàng đợi đã có
import Log from '../../middlewares/Log';
import Locals from '../../providers/Locals';

import SubscriptionService from '../../services/SubscriptionService'; // Import service mới



// Định nghĩa cấu trúc của người dùng đã được xác thực từ JWT payload
interface AuthenticatedUser {
    id: number;
    email: string;
}

class MediaController {

    /**
     * Lấy danh sách media của người dùng (có phân trang và bộ lọc)
     * Tương ứng với: GET /api/media
     */
    public static async getAll(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { limit = '60', page = '1', keyword, type, status = 'completed' } = req.query;

        try {
            const pageNum = parseInt(page as string, 10);
            const limitNum = parseInt(limit as string, 10);
            const offset = (pageNum - 1) * limitNum;

            const { items, total } = await Media.findAll({
                userId: user.id,
                limit: limitNum,
                offset,
                keyword: keyword as string,
                type: type as string,
                status: status as string,
            });

            // Giải mã trường 'meta' từ JSON string thành object
            const processedItems = items.map(item => {
                if (item.meta && typeof item.meta === 'string') {
                    try {
                        item.meta = JSON.parse(item.meta);
                    } catch (e) {
                        Log.warn(`Could not parse meta for media ID ${item.id}`);
                        item.meta = {};
                    }
                }
                return item;
            });

            return res.json({
                message: 'Danh sách media đã được lấy thành công.',
                success: true,
                items: processedItems,
                pager: {
                    currentPage: pageNum,
                    perPage: limitNum,
                    totalItems: total,
                    totalPages: Math.ceil(total / limitNum),
                }
            });
        } catch (error) {
            Log.error(`[MediaController] ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi máy chủ khi lấy dữ liệu media.' });
        }
    }

    /**
     * Xử lý upload file media (ảnh, video, audio)
     * Tương ứng với: POST /api/media/upload
     */
    public static async upload(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;

        if (!req.file) {
            return res.status(400).json({ error: 'Không có file nào được tải lên.' });
        }

        const file = req.file;
        const fileUrl = `/uploads/${file.filename}`;

        const mediaData: Omit<IMedia, 'id' | 'created_at'> = {
            user_id: user.id,
            url: fileUrl,
            filePath: file.path,
            size: file.size,
            name: file.originalname,
            type: file.mimetype.startsWith('image') ? 'image' : (file.mimetype.startsWith('video') ? 'video' : 'music'),
            status: 'completed',
        };


        try {
            const mediaId = await Media.create(mediaData);
            const newMedia = await Media.findById(mediaId);

            return res.status(201).json({
                message: 'Tải file lên thành công',
                success: true,
                data: newMedia,
            });
        } catch (error) {
            Log.error(`[MediaController] ${error.stack}`);
            return res.status(500).json({ error: 'Không thể lưu thông tin media.' });
        }
    }

    /**
     * Nhập video từ một URL bên ngoài
     * Tương ứng với: POST /api/media/import
     */
    public static async importVideo(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { videoUrl } = req.body;

        if (!videoUrl) {
            return res.status(400).json({ error: 'Vui lòng cung cấp videoUrl.' });
        }

        try {
            const nodejsUrl = Locals.config().nodejsUrl; // Giả sử bạn đã thêm nodejsUrl vào Locals
            const response = await axios.post(`${nodejsUrl}/import-video`, { videoUrl });

            if (response.data && response.data.filePath) {
                const { filePath, thumbnailUrl, size, name } = response.data;

                const mediaData: Omit<IMedia, 'id' | 'created_at'> = {
                    user_id: user.id,
                    url: filePath,
                    thumbnail_url: thumbnailUrl,
                    size,
                    name: name || 'Imported Video',
                    type: 'video',
                    status: 'completed',
                    meta: { source: videoUrl }
                };
                const mediaId = await Media.create(mediaData);
                const newMedia = await Media.findById(mediaId);
                return res.status(201).json({
                    message: 'Video đã được nhập thành công.',
                    success: true,
                    data: newMedia
                });
            } else {
                return res.status(400).json({ error: 'Không thể nhập video từ URL được cung cấp.' });
            }
        } catch (error) {
            Log.error(`[MediaController] ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi trong quá trình nhập video.' });
        }
    }

    /**
     * Tạo media bằng AI (ví dụ: gen-image, gen-audio)
     * Tương ứng với: POST /api/media/gen-ai
     */
    public static async generateAi(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { type, prompt, options } = req.body;

        if (!type) {
            return res.status(400).json({ error: 'Trường "type" là bắt buộc.' });
        }

        try {
            // 1. Lấy số credit yêu cầu và kiểm tra
            const requiredCredits = UserCredit.getRequiredCreditsFor(type);
            const hasEnough = await UserCredit.hasEnough(user.id, requiredCredits);

            if (!hasEnough) {
                return res.status(402).json({ error: 'Bạn không đủ credit để thực hiện hành động này.' });
            }
            const planLimits = await SubscriptionService.getPlanLimitsForUser(user.id);

            // 2. Đếm số job AI đang hoạt động của người dùng
            const activeJobs = await Media.countActiveJobsByUser(user.id, 'gen-');

            // 3. So sánh và trả về lỗi nếu vượt quá giới hạn
            if (activeJobs >= planLimits.maxConcurrentJobs) {
                return res.status(429).json({ // 429 Too Many Requests
                    error: `Bạn đã đạt đến giới hạn ${planLimits.maxConcurrentJobs} job chạy đồng thời. Vui lòng chờ cho các job hiện tại hoàn thành.`
                });
            }

            // 2. Tạo bản ghi media trong DB với status 'pending'
            const mediaData: Omit<IMedia, 'id' | 'created_at'> = {
                user_id: user.id,
                type: `gen-${type}`,
                status: 'pending',
                meta: { prompt, ...options }
            };
            const mediaId = await Media.create(mediaData);

            // 3. Trừ credit của người dùng
            await UserCredit.deduct(user.id, requiredCredits);

            // 4. Đưa công việc vào hàng đợi để xử lý nền
            Queue.dispatch('generate-ai-media', { mediaId, userId: user.id }, (data) => {
                Log.info(`Job for mediaId ${mediaId} dispatched. Data: ${JSON.stringify(data)}`);
            });

            const createdMedia = await Media.findById(mediaId);
            return res.status(202).json({
                message: 'Yêu cầu của bạn đã được tiếp nhận và đang được xử lý.',
                success: true,
                data: createdMedia
            });

        } catch (error) {
            Log.error(`[MediaController] ${error.stack}`);
            return res.status(500).json({ error: 'Lỗi khi tạo yêu cầu AI.' });
        }
    }

    /**
     * Xóa một mục media
     * Tương ứng với: DELETE /api/media/:id
     */
    public static async delete(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;
        const { id } = req.params;
        const mediaId = parseInt(id, 10);

        if (isNaN(mediaId)) {
            return res.status(400).json({ error: 'ID media không hợp lệ.' });
        }

        try {
            const isOwner = await Media.isOwner(mediaId, user.id);
            if (!isOwner) {
                return res.status(403).json({ error: 'Bạn không có quyền xóa mục media này.' });
            }

            await Media.delete(mediaId);
            return res.status(200).json({ message: 'Đã xóa media thành công.' });

        } catch (error) {
            Log.error(`[MediaController] ${error.stack}`);
            return res.status(500).json({ error: 'Không thể xóa media.' });
        }
    }
}

export default MediaController;
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
import Folder from '../../models/Folder';
import {IUser} from '../../interfaces/models/user'; // Import IUser interface
import {Database} from '../../providers/Database';

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
                message: req.__('media.list_success'),
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
            return res.status(500).json({ error: req.__('media.server_error') });
        }
    }

    /**
     * Xử lý upload file media (ảnh, video, audio)
     * Tương ứng với: POST /api/media/upload
     */
    public static async upload(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;

        if (!req.file) {
            return res.status(400).json({ error: req.__('media.no_file_uploaded') });
        }

        const file = req.file;
        const extension = file.originalname.split('.').pop()?.toLowerCase();
        const fileUrl = `/uploads/${file.filename}.${extension}`;

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
                message: req.__('media.upload_success'),
                success: true,
                data: newMedia,
            });
        } catch (error) {
            Log.error(`[MediaController] ${error.stack}`);
            return res.status(500).json({ error: req.__('media.cannot_save_media') });
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
            return res.status(400).json({ error: req.__('media.provide_video_url') });
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
                    message: req.__('media.video_imported_success'),
                    success: true,
                    data: newMedia
                });
            } else {
                return res.status(400).json({ error: req.__('media.cannot_import_video') });
            }
        } catch (error) {
            Log.error(`[MediaController] ${error.stack}`);
            return res.status(500).json({ error: req.__('media.import_video_error') });
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
            return res.status(400).json({ error: req.__('media.type_required') });
        }

        try {
            // 1. Lấy số credit yêu cầu và kiểm tra
            const requiredCredits = UserCredit.getRequiredCreditsFor(type);
            const hasEnough = await UserCredit.hasEnough(user.id, requiredCredits);

            if (!hasEnough) {
                return res.status(402).json({ error: req.__('media.insufficient_credits') });
            }
            const planLimits = await SubscriptionService.getPlanLimitsForUser(user.id);

            // 2. Đếm số job AI đang hoạt động của người dùng
            const activeJobs = await Media.countActiveJobsByUser(user.id, 'gen-');

            // 3. So sánh và trả về lỗi nếu vượt quá giới hạn
            if (activeJobs >= planLimits.maxConcurrentJobs) {
                return res.status(429).json({ // 429 Too Many Requests
                    error: req.__('media.concurrent_jobs_limit', { limit: planLimits.maxConcurrentJobs.toString() })
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
                message: req.__('media.request_accepted'),
                success: true,
                data: createdMedia
            });

        } catch (error) {
            Log.error(`[MediaController] ${error.stack}`);
            return res.status(500).json({ error: req.__('media.ai_request_error') });
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
            return res.status(400).json({ error: req.__('media.invalid_media_id') });
        }

        try {
            const isOwner = await Media.isOwner(mediaId, user.id);
            if (!isOwner) {
                return res.status(403).json({ error: req.__('media.no_permission_delete') });
            }

            await Media.delete(mediaId);
            return res.status(200).json({ message: req.__('media.delete_success') });

        } catch (error) {
            Log.error(`[MediaController] ${error.stack}`);
            return res.status(500).json({ error: req.__('media.cannot_delete_media') });
        }
    }

     /**
     * Lấy nội dung của một thư mục (bao gồm thư mục con và file).
     */
    public static async getFolderContents(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        const folderId = req.params.folderId ? Number(req.params.folderId) : null;

        try {
            const contents = await Folder.getContents(user.id, folderId);
            return res.json(contents);
        } catch (error) {
            return res.status(500).json({ error: req.__('media.cannot_get_folder_data') });
        }
    }

    /**
     * Tạo một thư mục mới.
     */
    public static async createFolder(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        const { name, parentId = null } = req.body;

        if (!name) {
            return res.status(400).json({ error: req.__('media.folder_name_required') });
        }

        try {
            const newFolder = await Folder.create(user.id, parentId, name);
            return res.status(201).json({ message: req.__('media.create_folder_success'), ...newFolder });
        } catch (error) {
            return res.status(500).json({ error: req.__('media.cannot_create_folder') });
        }
    }

    /**
     * Di chuyển một hoặc nhiều file và thư mục.
     */
    public static async moveItems(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        const { items, newParentId = null } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: req.__('media.items_array_required') });
        }

        const folderIdsToMove: number[] = items
            .filter(item => item.type === 'folder' && item.id)
            .map(item => Number(item.id));
        
        const fileIdsToMove: number[] = items
            .filter(item => item.type === 'file' && item.id)
            .map(item => Number(item.id));

        const connection = await Database.pool.getConnection();
        try {
            await connection.beginTransaction();

            if(folderIdsToMove.length > 0) {
                await Folder.moveMultiple(folderIdsToMove, newParentId, user.id);
            }
            if(fileIdsToMove.length > 0) {
                await Media.moveMultiple(fileIdsToMove, newParentId, user.id);
            }
            
            await connection.commit();
            return res.json({ message: req.__('media.move_items_success') });
        } catch (error) {
            await connection.rollback();
            return res.status(500).json({ error: req.__('media.move_items_error') });
        } finally {
            connection.release();
        }
    }

}

export default MediaController;
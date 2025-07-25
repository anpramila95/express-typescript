/**
 * File này xử lý các công việc liên quan đến media từ hàng đợi
 */

import Log from '../../middlewares/Log';
import Media from '../../models/Media';
// Import các service cần thiết khác (ví dụ: một service để gọi API AI)
// import AiGenerationService from '../../services/AiGenerationService';

class MediaHandler {
    /**
     * Xử lý công việc 'generate-ai-media'
     */
    public static async process({ data }): Promise<void> {
        const { mediaId, userId } = data;
        Log.info(`[Worker] Bắt đầu xử lý job 'generate-ai-media' cho mediaId: ${mediaId}`);

        try {
            // 1. Lấy thông tin media từ database
            const media = await Media.findById(mediaId);
            if (!media) {
                Log.error(`[Worker] Không tìm thấy media với ID: ${mediaId}`);
                return;
            }

            // Đánh dấu là đang xử lý
            await Media.update(mediaId, { status: 'processing' });

            // 2. Thực hiện tác vụ nặng ở đây (ví dụ: gọi API AI)
            // const resultUrl = await AiGenerationService.generate(media.meta.prompt, media.meta);

            // Giả lập kết quả trả về sau 10 giây
            await new Promise(resolve => setTimeout(resolve, 10000));
            const resultUrl = `https://example.com/generated-media/${mediaId}.jpg`;

            // 3. Cập nhật lại bản ghi media trong database với kết quả
            await Media.update(mediaId, {
                status: 'completed',
                url: resultUrl,
                thumbnail_url: resultUrl
            });

            Log.info(`[Worker] Đã xử lý xong job cho mediaId: ${mediaId}`);

        } catch (error) {
            Log.error(`[Worker] Lỗi khi xử lý mediaId ${mediaId}: ${error.stack}`);
            // Cập nhật trạng thái 'failed' để người dùng biết
            await Media.update(mediaId, { status: 'failed' });
        }
    }
}

export default MediaHandler;
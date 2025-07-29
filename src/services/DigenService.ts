import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import getToken from './getTokenService'; // Giả sử bạn có file utils.ts trong providers
import Log from '../middlewares/Log';
import { Agent } from 'https';
import getAgent from './utils/getAgent';

// --- Interfaces để đảm bảo Type Safety ---

interface CreateJobArgs {
    thumbnail: string;
    prompt?: string;
    model?: string;
    ratio?: '16:9' | '9:16' | 'landscape' | 'portrait';
    lipsync?: number;
    syncMode?: 'human' | string;
    seconds?: number;
    audio_url?: string;
    last_image?: string | null;
    lora_id?: string | null;
}

interface CreateJobResult {
    jobId: string;
    token: string;
}

// --- Digen Service Class ---

class DigenService {

    /**
     * Tạo một job mới trên hệ thống Digen.
     * @param args Các tham số cần thiết để tạo job.
     * @param run Số lần đã thử lại.
     * @returns Thông tin job nếu thành công, ngược lại trả về null.
     */
    public static async createJob(args: CreateJobArgs, run: number = 0): Promise<CreateJobResult | null> {
        if (run > 5) {
            Log.error("❌ Đã vượt quá số lần thử tạo job Digen.");
            return null;
        }

        try {
            const agent: Agent = await getAgent();
            // Lưu ý: Cần đảm bảo các hàm getToken và getCodeDigen tồn tại trong Utils
            const tokenResult = await getToken.digen(0, 0, agent);
            const token: string | null = typeof tokenResult === 'string' ? tokenResult : null;
            const getCode: any = token ? await getToken.getCodeDigen(token, agent) : null;

            if (!token) {
                Log.error("❌ Không thể lấy token Digen.");
                return null;
            }

            const url = `https://api.digen.ai/v1/scene/job/submit`;
            
            // Gán giá trị mặc định cho các tham số
            let { 
                thumbnail, 
                prompt = '', 
                model = "rm", 
                ratio = '16:9', 
                lipsync = 0, 
                syncMode = 'human', 
                seconds = 5, 
                audio_url = 'ok', 
                last_image = null, 
                lora_id = null 
            } = args;

            // Chuyển đổi ratio
            if (ratio === "16:9") {
                ratio = "landscape";
            } else if (ratio === "9:16") {
                ratio = "portrait";
            }

            const data = {
                "uuid": uuidv4(),
                "taskType": "task",
                "taskStatus": "queued",
                "createdTime": new Date().getTime(),
                "scene_id": "5",
                "model": model,
                "scene_params": JSON.stringify({
                    "thumbnail": thumbnail,
                    "image_url": thumbnail,
                    "last_image_url": last_image,
                    "video_gen_prompt": prompt,
                    "labelID": "",
                    "audio_url": audio_url,
                    "is_add_background_audio": "0",
                    "background_audio_url": "",
                    "lipsync": lipsync,
                    "syncMode": syncMode,
                    "aspect_ratio": ratio,
                    "seconds": seconds,
                    "replicate_jobId": "",
                    "tags": {
                        "modelName": 'Real Motion 2.5'
                    },
                    "engine": "2.5",
                    "strength": "1.0",
                    "code": getCode
                }),
                "submitting": true,
                'lora_id': lora_id ? lora_id : null,
            };

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                'Content-Type': 'application/json',
                'digen-sessionid': uuidv4(),
                'referer': 'https://rm.digen.ai/',
                'digen-language': 'vi',
                'digen-token': token,
                'accept': 'application/json, text/plain, */*',
            };

            const response = await axios.post(url, data, {
                headers: headers,
                httpsAgent: agent,
            });

            const dataResponse = response.data;
            if (!dataResponse?.data?.jobId) {
                if (dataResponse.errMsg === "Exceed the concurrency limit!") {
                    // Thử lại nếu bị giới hạn request đồng thời
                    Log.warn("Digen concurrency limit exceeded, retrying...");
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Đợi 3s trước khi thử lại
                    return this.createJob(args, run); // Không tăng `run` để có thể thử lại nhiều lần hơn
                }
                Log.error(`Tạo job Digen thất bại: ${dataResponse.errMsg || 'Unknown error'}`);
                return this.createJob(args, run + 1); // Thử lại với lỗi khác
            }

            Log.info(`✅ Job Digen đã được tạo thành công. Job ID: ${dataResponse.data.jobId}`);
            return {
                jobId: dataResponse.data.jobId,
                token: token,
            };

        } catch (error) {
            const axiosError = error as AxiosError;
            Log.error(`❌ Lỗi khi tạo job Digen: ${axiosError.response ? JSON.stringify(axiosError.response.data) : axiosError.message}`);
            // Cân nhắc thử lại nếu có lỗi mạng
            if (axiosError.code === 'ECONNRESET' || axiosError.code === 'ETIMEDOUT') {
                 return this.createJob(args, run + 1);
            }
            return null;
        }
    }
}

export default DigenService;
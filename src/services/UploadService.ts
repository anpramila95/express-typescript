import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import { Agent } from 'https';
import { v4 as uuidv4 } from 'uuid';
import progress from 'progress-stream';

// --- Giả định: Các hàm này được import từ các file khác ---
// Bạn cần thay thế các đường dẫn import này cho đúng với cấu trúc dự án của bạn.
import getToken from './getTokenService'; // Giả sử bạn có một TokenService
import getAgent from './utils/getAgent'; // Giả sử bạn có một hàm tiện ích để lấy agent

// --- Định nghĩa kiểu dữ liệu ---

type MimeType = 'image/webp' | 'image/png' | 'image/jpeg' | 'image/gif' | 'audio/mpeg' | 'video/mp4';
type FileExtension = 'webp' | 'png' | 'jpg' | 'jpeg' | 'gif' | 'mp3' | 'mp4';

interface PresignResponse {
    data: {
        url: string;
    };
}

/**
 * Lớp UploadService chịu trách nhiệm cho việc tải tệp lên Digen.
 */
export class UploadService {

    private readonly MAX_RETRIES = 5;

    /**
     * Lấy URL đã ký trước (presigned URL) từ Digen để chuẩn bị cho việc tải lên.
     * @param format Phần mở rộng của tệp (ví dụ: 'webp', 'mp3').
     * @param token Token xác thực Digen.
     * @param agent HTTPS Agent để sử dụng proxy.
     * @returns URL đã ký trước hoặc null nếu thất bại.
     */
    private async getPresignedUrl(format: FileExtension, token: string, agent: Agent): Promise<string | null> {
        const url = `https://api.digen.ai/v1/element/priv/presign?format=${format}`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            'Content-Type': 'application/json',
            'digen-sessionid': uuidv4(),
            'digen-token': token,
            'digen-language': 'en-US'
        };

        try {
            const response = await axios.get<PresignResponse>(url, { headers, httpsAgent: agent });
            if (response.status !== 200 || !response.data?.data?.url) {
                console.error(`❌ Lỗi khi lấy presign url: ${response.statusText}`);
                return null;
            }
            return response.data.data.url;
        } catch (error) {
            const err = error as AxiosError;
            console.error(`❌ Lỗi khi gọi API lấy presign url:`, err.response?.data || err.message);
            return null;
        }
    }

    /**
     * Tải một buffer tệp lên URL đã ký trước.
     * @param endpoint URL đã ký trước.
     * @param fileBuffer Buffer chứa dữ liệu tệp.
     * @param mimeType Kiểu MIME của tệp.
     * @param fileSize Kích thước tệp (bytes).
     * @returns boolean cho biết việc tải lên có thành công hay không.
     */
    private async uploadFileToEndpoint(endpoint: string, fileBuffer: Buffer, mimeType: MimeType, fileSize: number): Promise<boolean> {
        try {
            const progressStream = progress({ length: fileSize, time: 100 });
            progressStream.on('progress', (p) => {
                process.stdout.write(`\r🚀 Đang upload: ${Math.round(p.percentage)}%`);
            });
            
            const uploadResponse = await axios.put(endpoint, fileBuffer, {
                headers: {
                    'Content-Type': mimeType,
                    'Content-Length': fileSize
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                transformRequest: [(data, headers) => {
                    // Đính kèm stream vào request
                    return data.pipe(progressStream);
                }],
            });

            process.stdout.write(`\r✅ Đã upload thành công 100%!\n`);
            return uploadResponse.status === 200;
        } catch (error) {
            const err = error as AxiosError;
            console.error(`\n❌ Lỗi khi PUT tệp lên endpoint:`, err.response?.data || err.message);
            return false;
        }
    }

    /**
     * Lấy kiểu MIME từ phần mở rộng của tệp.
     * @param extension Phần mở rộng của tệp.
     * @returns Kiểu MIME tương ứng.
     */
    private getMimeType(extension: FileExtension): MimeType {
        const mimeMap: Record<FileExtension, MimeType> = {
            'webp': 'image/webp',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'mp3': 'audio/mpeg',
            'mp4': 'video/mp4',
        };
        return mimeMap[extension];
    }
    
    /**
     * Phương thức chung để xử lý logic tải lên cho bất kỳ loại tệp nào.
     * @param filePath Đường dẫn đến tệp.
     * @param extension Phần mở rộng của tệp.
     * @param fileTypeDescription Mô tả loại tệp (ví dụ: 'ảnh', 'MP3').
     * @param run Số lần thử lại hiện tại.
     * @returns URL công khai của tệp đã tải lên hoặc null nếu thất bại.
     */
    private async uploadGenericFile(
        filePath: string, 
        extension: FileExtension, 
        fileTypeDescription: string,
        run = 0
    ): Promise<string | null> {
        if (!fs.existsSync(filePath)) {
            console.log(`❌ Không tìm thấy ${fileTypeDescription}: ${filePath}`);
            return null;
        }
        if (run >= this.MAX_RETRIES) {
            console.log(`❌ Lỗi khi upload ${fileTypeDescription} sau ${this.MAX_RETRIES} lần thử: ${filePath}`);
            return null;
        }

        try {
            // Giả định `getToken.digen` trả về một string hoặc null
            const token = await getToken.digen(0, 3991) as string | null;
            if (!token) {
                console.error('❌ Không thể lấy Digen token.');
                // Thử lại sau một khoảng thời gian ngắn
                await new Promise(res => setTimeout(res, 2000));
                return this.uploadGenericFile(filePath, extension, fileTypeDescription, run + 1);
            }

            const agent = await getAgent();
            const endpoint = await this.getPresignedUrl(extension, token, agent);
            if (!endpoint) {
                return this.uploadGenericFile(filePath, extension, fileTypeDescription, run + 1);
            }

            const fileBuffer = fs.readFileSync(filePath);
            const fileSize = fs.statSync(filePath).size;
            const mimeType = this.getMimeType(extension);

            const success = await this.uploadFileToEndpoint(endpoint, fileBuffer, mimeType, fileSize);
            if (!success) {
                return this.uploadGenericFile(filePath, extension, fileTypeDescription, run + 1);
            }

            return endpoint.split('?')[0];

        } catch (error: any) {
            console.error(`❌ Lỗi không xác định khi upload ${fileTypeDescription}:`, error.message);
            return this.uploadGenericFile(filePath, extension, fileTypeDescription, run + 1);
        }
    }

    /**
     * Tải một tệp ảnh lên Digen.
     * @param imagePath Đường dẫn đến tệp ảnh.
     * @param extension Phần mở rộng của ảnh ('webp', 'png', 'jpg', 'gif').
     * @param run Số lần thử lại.
     * @returns URL công khai của ảnh hoặc null nếu thất bại.
     */
    public async uploadDigenImage(imagePath: string, extension: 'webp' | 'png' | 'jpg' | 'jpeg' | 'gif', run = 0): Promise<string | null> {
        return this.uploadGenericFile(imagePath, extension, 'ảnh', run);
    }
    
    /**
     * Tải một tệp MP3 lên Digen.
     * @param mp3Path Đường dẫn đến tệp MP3.
     * @param run Số lần thử lại.
     * @returns URL công khai của tệp MP3 hoặc null nếu thất bại.
     */
    public async uploadDigenMp3(mp3Path: string, run = 0): Promise<string | null> {
        return this.uploadGenericFile(mp3Path, 'mp3', 'MP3', run);
    }

    /**
     * Tải một tệp MP4 lên Digen.
     * @param mp4Path Đường dẫn đến tệp MP4.
     * @param run Số lần thử lại.
     * @returns URL công khai của tệp MP4 hoặc null nếu thất bại.
     */
    public async uploadDigenVideo(mp4Path: string, run = 0): Promise<string | null> {
        return this.uploadGenericFile(mp4Path, 'mp4', 'MP4', run);
    }
}

//export
export default UploadService;

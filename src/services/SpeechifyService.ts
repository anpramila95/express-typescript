import axios, { AxiosError } from 'axios';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { Agent } from 'https';
import * as FormData from 'form-data';
import { RowDataPacket, ResultSetHeader, Pool } from 'mysql2';

// --- Giả định: Bạn import pool từ file quản lý kết nối DB của mình ---
import Database from '../providers/Database';

// --- Interfaces & Types ---

interface AccountMetaData {
    token?: string;
    token2?: string;
    password?: string;
    email?: string;
    key?: string;
}

interface AccountRow extends RowDataPacket {
    id: number;
    platform: string;
    meta: string;
}

interface SpeechifyTokens {
    token: string;
    token2: string;
}

interface CheckJwtArgs {
    token?: string | null;
    token2?: string | null;
    email?: string | null;
    password?: string | null;
}

interface PublishArgs extends CheckJwtArgs {
    audioUrl: string;
    voiceName: string;
    gender?: 'male' | 'female' | 'any';
    enhanceAudio?: boolean;
}

// --- Lớp Dịch vụ ---

export class SpeechifyService {
    private pool: Pool;
    private utils: { runQuery: <T extends RowDataPacket[] | ResultSetHeader>(sql: string, params?: any[]) => Promise<T>, getAgent: () => Promise<Agent>, saveFileFromUrl: (url: string, path: string) => Promise<boolean> };

    constructor(pool: Pool, utils: any) {
        this.pool = pool;
        this.utils = utils;
    }

    /**
     * Lấy và xác thực token từ cơ sở dữ liệu.
     */
    public async getTokenFromDB(run = 0, id?: number): Promise<AccountMetaData | null> {
        if (run > 5) {
            console.error("❌ Đã thử quá 5 lần, không thể lấy token từ DB.");
            return null;
        }
        try {
            let query = "SELECT * FROM accounts WHERE platform = 'speechify2'";
            const params: any[] = [];
            if (id) {
                query += " AND id = ?";
                params.push(id);
            }
            query += " ORDER BY updated_at ASC LIMIT 1";

            const [getRow] = await Database.pool.query<AccountRow[]>(query, params);
            if (getRow.length === 0) return null;

            const account = getRow[0];
            let fileData: AccountMetaData = JSON.parse(account.meta);

            const validTokens = await this.checkJwt(fileData);
            if (validTokens) {
                await this.utils.runQuery("UPDATE accounts SET updated_at = NOW() WHERE id = ?", [account.id]);
                return { ...fileData, ...validTokens };
            }

            // Nếu token không hợp lệ, lấy token mới
            const newTokens = await this.getToken({ email: fileData.email, password: fileData.password });
            if (!newTokens) {
                console.error("❌ Không thể làm mới token từ Speechify.");
                return this.getTokenFromDB(run + 1, account.id);
            }

            fileData = { ...fileData, ...newTokens };
            await Database.pool.query("UPDATE accounts SET meta = ?, updated_at = NOW() WHERE id = ?", [JSON.stringify(fileData), account.id]);
            console.log(`✅ Làm mới và cập nhật token thành công cho tài khoản Speechify id ${account.id}`);
            return fileData;
        } catch (error: any) {
            console.error('❌ Lỗi khi lấy token từ DB:', error.message);
            return this.getTokenFromDB(run + 1, id);
        }
    }

    /**
     * Lấy token từ API của Google và Speechify.
     */
    public async getToken(args: { email?: string | null, password?: string | null }): Promise<SpeechifyTokens | null> {
        const { email, password } = args;
        if (!email || !password) return null;

        try {
            const agent = await this.utils.getAgent();
            const googleUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyDbAIg5AN6Cb5kITejfovleb5VDWw0Kv7s`;
            const googleData = { email, password, returnSecureToken: true };
            const googleResponse = await axios.post<{ idToken: string }>(googleUrl, googleData, { httpsAgent: agent });
            const idToken = googleResponse.data.idToken;

            const speechifyToken = await this.getIdToken(idToken, agent);
            if (!speechifyToken) return null;

            return { token: idToken, token2: speechifyToken };
        } catch (error) {
            const err = error as AxiosError;
            console.error(`Lỗi đăng nhập:`, err.response?.data || err.message);
            return null;
        }
    }

    /**
     * Lấy token thứ cấp của Speechify (token2).
     */
    private async getIdToken(idToken: string, agent: Agent): Promise<string | null> {
        try {
            const url = `https://auth.api.speechify.com/v1/id-tokens`;
            const data = { projectId: "videostudio-production" };
            const headers = {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            };
            const response = await axios.post<{ token: string }>(url, data, { headers, httpsAgent: agent });
            return response.data.token;
        } catch (error) {
            const err = error as AxiosError;
            console.error(`Lỗi lấy id-token của Speechify:`, err.response?.data || err.message);
            return null;
        }
    }

    /**
     * Kiểm tra tính hợp lệ của JWT. Nếu không hợp lệ hoặc hết hạn, sẽ làm mới token.
     */
    public async checkJwt(args: CheckJwtArgs): Promise<SpeechifyTokens | null> {
        const { token, token2, email, password } = args;

        if (!token || !token2) {
            return this.getToken({ email, password });
        }

        try {
            const decoded = jwt.decode(token) as jwt.JwtPayload | null;
            if (!decoded?.exp || decoded.exp < Date.now() / 1000) {
                console.log("Token hết hạn, đang làm mới...");
                return this.getToken({ email, password });
            }
            return { token, token2 };
        } catch (error: any) {
            console.error(`Lỗi giải mã JWT:`, error.message);
            return this.getToken({ email, password });
        }
    }

    /**
     * Lấy URL để tải lên một asset.
     */
    public async getUploadUrlForAsset(args: CheckJwtArgs & { audioUrl: string }): Promise<string | null> {
        const tokens = await this.checkJwt(args);
        if (!tokens) throw new Error("Token không hợp lệ hoặc đã hết hạn.");

        const tempAudioPath = './storage/tts/audio.mp3';
        if (args.audioUrl.startsWith('http')) {
            await this.utils.saveFileFromUrl(args.audioUrl, tempAudioPath);
        } else {
            if (!fs.existsSync(args.audioUrl)) throw new Error("File audio không tồn tại.");
            fs.copyFileSync(args.audioUrl, tempAudioPath);
        }

        const agent = await this.utils.getAgent();
        const url = `https://videostudio.api.speechify.com/graphql`;
        const query = `mutation GetUploadUrlForAsset($input: UploadUrlForAssetInput!) { getUploadUrlForAsset(input: $input) { uploadUrl } }`;
        const variables = {
            input: {
                contentType: "audio/mpeg",
                filename: `clone-${Date.now()}-${uuidv4()}.mp3`,
                projectId: "",
                size: fs.statSync(tempAudioPath).size
            }
        };

        const response = await axios.post<{ data: { getUploadUrlForAsset: { uploadUrl: string } } }>(url, { operationName: "GetUploadUrlForAsset", query, variables }, {
            headers: { 'Authorization': `Bearer ${tokens.token2}`, 'Content-Type': 'application/json' },
            httpsAgent: agent,
        });

        const uploadUrl = response.data.data.getUploadUrlForAsset.uploadUrl;
        if (!uploadUrl) throw new Error("Không thể lấy URL để tải lên.");

        console.log(`Đang tải file audio lên...`);
        const uploadResponse = await axios.put(uploadUrl, fs.createReadStream(tempAudioPath), {
            headers: { 'Content-Type': 'audio/mpeg' }
        });

        if (uploadResponse.status !== 200) throw new Error("Tải file audio lên thất bại.");
        
        console.log(`Tải file audio lên thành công.`);
        return uploadUrl.split('?')[0];
    }

    /**
     * Tiền xử lý audio để nhân bản giọng nói.
     */
    public async preprocessAudioForCloning(audioUrl: string, args: CheckJwtArgs): Promise<string | null> {
        const tokens = await this.checkJwt(args);
        if (!tokens) throw new Error("Token không hợp lệ hoặc đã hết hạn.");
        
        const agent = await this.utils.getAgent();
        const url = `https://videostudio.api.speechify.com/graphql`;
        const query = `mutation PreprocessAudioForCloning($audioUrl: String!) { preprocessAudioForCloning(audioUrl: $audioUrl) { cdnUrl } }`;
        const variables = { audioUrl };
        
        const response = await axios.post<{ data: { preprocessAudioForCloning: { cdnUrl: string } } }>(url, { operationName: "PreprocessAudioForCloning", query, variables }, {
            headers: { 'Authorization': `Bearer ${tokens.token2}`, 'Content-Type': 'application/json' },
            httpsAgent: agent
        });

        return response.data.data.preprocessAudioForCloning.cdnUrl;
    }

    /**
     * Nâng cao chất lượng audio.
     */
    public async enhanceAudio(audioUrl: string, args: CheckJwtArgs): Promise<string | null> {
        const tokens = await this.checkJwt(args);
        if (!tokens) throw new Error("Token không hợp lệ hoặc đã hết hạn.");

        const agent = await this.utils.getAgent();
        const url = `https://videostudio.api.speechify.com/graphql`;
        const query = `mutation EnhanceAudio($audioUrl: String!) { enhanceAudio(audioUrl: $audioUrl) }`;
        const variables = { audioUrl };
        
        const response = await axios.post<{ data: { enhanceAudio: string } }>(url, { operationName: "EnhanceAudio", query, variables }, {
            headers: { 'Authorization': `Bearer ${tokens.token2}`, 'Content-Type': 'application/json' },
            httpsAgent: agent
        });
        
        console.log(`Nâng cao chất lượng audio thành công.`);
        return response.data.data.enhanceAudio;
    }

    /**
     * "Publish" một giọng nói mới.
     */
    public async publish(args: PublishArgs): Promise<string | false> {
        try {
            const tokens = await this.checkJwt(args);
            if (!tokens) throw new Error("Token không hợp lệ hoặc đã hết hạn.");

            let { audioUrl, voiceName, gender = 'any', enhanceAudio = false } = args;

            if (enhanceAudio) {
                const enhancedUrl = await this.enhanceAudio(audioUrl, tokens);
                if (enhancedUrl) audioUrl = enhancedUrl;
            }

            const tempSamplePath = './storage/tts/sample.wav';
            const tempAvatarPath = './storage/tts/avatar.webp';
            await this.utils.saveFileFromUrl(audioUrl, tempSamplePath);

            const agent = await this.utils.getAgent();
            const url = `https://vms.api.speechify.com/personal-voices`;

            const form = new FormData();
            form.append('name', voiceName);
            form.append('gender', gender);
            form.append('locale', 'vi-VN');
            form.append('consent[fullName]', 'NGUYEN SINH THANH');
            form.append('consent[email]', 'sinhthanh.dev@gmail.com');
            form.append('avatarFile', fs.createReadStream(tempAvatarPath));
            form.append('sampleFile', fs.createReadStream(tempSamplePath));

            const response = await axios.post<{ slug: string }>(url, form, {
                headers: {
                    ...form.getHeaders(),
                    'authorization': `Bearer ${tokens.token}`
                },
                httpsAgent: agent,
            });

            console.log(`Publish giọng nói thành công`, response.data);
            return response.data.slug || false;
        } catch (error) {
            const err = error as AxiosError;
            console.error(`Lỗi khi publish giọng nói:`, err.response?.data || err.message);
            return false;
        }
    }
    
    /**
     * Hàm tổng hợp để huấn luyện một giọng nói mới.
     */
    public async training(args: PublishArgs): Promise<string | false> {
        try {
            const tokens = await this.checkJwt(args);
            if (!tokens) throw new Error("Token không hợp lệ hoặc đã hết hạn.");

            const uploadUrl = await this.getUploadUrlForAsset({ ...args, ...tokens });
            if (!uploadUrl) throw new Error("Không thể lấy URL để tải lên asset.");

            const preprocessedUrl = await this.preprocessAudioForCloning(uploadUrl, tokens);
            if (!preprocessedUrl) throw new Error("Tiền xử lý audio thất bại.");

            const finalAudioUrl = args.enhanceAudio ? (await this.enhanceAudio(preprocessedUrl, tokens) || preprocessedUrl) : preprocessedUrl;

            const finalArgs = { ...args, ...tokens, audioUrl: finalAudioUrl };
            
            return await this.publish(finalArgs);
        } catch (error: any) {
            console.error("Lỗi trong quá trình training:", error.message);
            return false;
        }
    }
}
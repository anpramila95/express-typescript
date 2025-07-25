import axios, { AxiosResponse } from 'axios';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as FormData from 'form-data';
import { Agent } from 'https'; // For httpsAgent type in Node.js
import Log from '../middlewares/Log';
// Import specific types from mysql2/promise for database query results
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import Database from '../providers/Database'; // Import the Database class
import getAgent from './utils/getAgent'; // Giả sử bạn có một hàm tiện ích để lấy agent

// --- Interfaces for Data Structures ---

interface AccountMetaData {
    token?: string;
    password?: string;
    userId?: string;
    email?: string;
    api_key?: string;
    created_at?: number; // Unix timestamp in seconds for token creation
    token_did?: string;
    key?: string; // For Speechify token
}

interface AccountRow extends RowDataPacket {
    id: number;
    platform: string;
    meta: string; // JSON string of AccountMetaData
    updated_at: string; // Date string or MySQL DATETIME
    processing_status: number;
    locked_by_worker: string | null;
    locked_at: string | null; // Date string or MySQL DATETIME
}


interface GetTokenService {
    getAccountByType: (type?: string, run?: number) => Promise<any>;
    getDreamFaceApp: (run?: number) => Promise<AccountMetaData | boolean | null>;
    dreamFacGetJob: (jobId: string, data: any, run?: number) => Promise<void>;
    getTokenSpeechify: (run?: number) => Promise<string | boolean | null>;
    piclumen: (run?: number) => Promise<string | null>;
    reward: (token: string, agent: Agent) => Promise<any>;
    getInfo: (token: string, agent: Agent, run?: number) => Promise<boolean | null>;
    digenRemain: (token: string | null, agent: Agent) => Promise<any>;
    getCodeDigen: (token: string, agent: Agent) => Promise<string | null>;
    digenGetJob: (jobId: string, token: string, agent: Agent) => Promise<any>;
    digen: (run?: number, filePathOne?: number | null, agent?: Agent | null) => Promise<string | boolean | null>;
    deleteJobDigen: (jobId: string, token: string, agent: Agent) => Promise<void>;
    postJob: (data: any, token: string, agent: Agent) => Promise<{ jobId: string; token: string } | null>;
}

const getToken: GetTokenService = {
    getAccountByType: async (type?: string, run = 0): Promise<any> => {
        try {
            if (run > 5) {
                Log.error("❌ Đã thử quá 5 lần, không thể tạo token.");
                return null;
            }
            // Using Database.pool.query directly for SELECT
            const [getRow] = await Database.pool.query<AccountRow[]>("SELECT * FROM accounts WHERE platform = '" + type + "' ORDER BY updated_at ASC LIMIT 1");

            if (getRow.length === 0) {
                return false;
            }
            const account: AccountRow = getRow[0];
            let fileData: AccountMetaData = JSON.parse(account.meta);

            return fileData;

        } catch (error: any) {
            Log.error('❌ Lỗi khi lấy token DreamFaceApp:');
            return await getToken.getDreamFaceApp(run + 1);
        }
    },
    getDreamFaceApp: async (run = 0): Promise<AccountMetaData | boolean | null> => {
        try {
            if (run > 5) {
                Log.error("❌ Đã thử quá 5 lần, không thể tạo token.");
                return null;
            }
            const agent: Agent = await getAgent();
            // Using Database.pool.query directly for SELECT
            const [getRow] = await Database.pool.query<AccountRow[]>("SELECT * FROM accounts WHERE platform = 'h5' ORDER BY updated_at ASC LIMIT 1");

            if (getRow.length === 0) {
                return false;
            }
            const account: AccountRow = getRow[0];
            let fileData: AccountMetaData = JSON.parse(account.meta);

            if (fileData.token) {
                const decoded = jwt.decode(fileData.token) as jwt.JwtPayload | null;
                if (decoded && decoded.exp && new Date().getTime() < decoded.exp * 1000) {
                    // Using Database.pool.query directly for UPDATE
                    await Database.pool.query<ResultSetHeader>("UPDATE accounts SET updated_at = NOW() WHERE id = ?", [account.id]);
                    return fileData;
                }
            }

            const url = `https://tools.dreamfaceapp.com/df-server/user/login`;
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                'Content-Type': 'application/json'
            };

            const data = {
                "password": fileData.password,
                "user_id": fileData.userId,
                "third_id": fileData.email,
                "third_platform": "EMAIL",
                "third_ext": {
                    "email": fileData.email,
                },
                "register_source": null
            };

            interface DreamFaceAppLoginResponse {
                status_msg: string;
                data: {
                    token: string;
                };
            }
            const response: AxiosResponse<DreamFaceAppLoginResponse> = await axios.post(url, data, { headers, httpsAgent: agent });
            const res = response.data;
            if (res.status_msg === "Success") {
                const userData = res.data;
                const token = userData.token;
                fileData = {
                    ...fileData,
                    token: token,
                };
                // Using Database.pool.query directly for UPDATE
                await Database.pool.query<ResultSetHeader>("UPDATE accounts SET meta = ?, updated_at = NOW() WHERE id = ?", [JSON.stringify(fileData), account.id]);
                return fileData;
            } else {
                Log.error(`❌ Lỗi khi đăng nhập DreamFaceApp: ${res.status_msg}`);
                return await getToken.getDreamFaceApp(run + 1);
            }

        } catch (error: any) {
            Log.error('❌ Lỗi khi lấy token DreamFaceApp:');
            return await getToken.getDreamFaceApp(run + 1);
        }
    },

    dreamFacGetJob: async (jobId: string, data: any, run = 0): Promise<void> => {
        console.log(`DreamFacGetJob called for jobId: ${jobId}`);
    },

    getTokenSpeechify: async (run = 0): Promise<string | boolean | null> => {
        if (run > 5) {
            Log.error("❌ Đã thử quá 5 lần, không thể tạo token.");
            return null;
        }
        // Using Database.pool.query directly for SELECT
        const [getRow] = await Database.pool.query<AccountRow[]>("SELECT * FROM accounts WHERE platform = 'speechify' ORDER BY updated_at ASC LIMIT 1");
        if (getRow.length === 0) {
            return false;
        }
        const account: AccountRow = getRow[0];
        let fileData: AccountMetaData = JSON.parse(account.meta);
        // Using Database.pool.query directly for UPDATE
        await Database.pool.query<ResultSetHeader>("UPDATE accounts SET updated_at = NOW() WHERE id = ?", [account.id]);
        return fileData.key || null;
    },

    /**
     * Lấy token Piclumen từ tài khoản đã lưu trong cơ sở dữ liệu.
     * @param run Số lần thử hiện tại (để tránh vòng lặp vô hạn).
     * @returns Token Piclumen hoặc null nếu không thành công.
     */
    piclumen: async (run = 0): Promise<string | null> => {
        Log.info('🔍 Đang lấy token Piclumen...');
        const workerId = uuidv4();
        let accountId: number | null = null;

        try {
            if (run > 5) {
                Log.error("❌ Đã thử quá 5 lần, không thể tạo token.");
                return null;
            }
            const agent: Agent = await getAgent();
            // Using Database.pool.query directly for UPDATE
            const [updateResult] = await Database.pool.query<ResultSetHeader>(
                `UPDATE accounts
                 SET
                    processing_status = 1,
                    locked_by_worker = ?,
                    locked_at = NOW()
                 WHERE
                    platform = 'piclumen' AND
                    processing_status = 0
                 ORDER BY updated_at ASC
                 LIMIT 1;`,
                [workerId]
            );

            if (updateResult.affectedRows === 0) {
                console.log("⚠️ Không có tài khoản nào khả dụng tại thời điểm này.");
                return null;
            }

            // Using Database.pool.query directly for SELECT
            const [getRow] = await Database.pool.query<AccountRow[]>(
                `SELECT * FROM accounts WHERE locked_by_worker = ?`,
                [workerId]
            );

            if (getRow.length === 0) {
                if (accountId) {
                    // Using Database.pool.query directly for UPDATE
                    await Database.pool.query<ResultSetHeader>(
                        `UPDATE accounts
                         SET
                            processing_status = 0,
                            locked_by_worker = NULL,
                            locked_at = NULL,
                            updated_at = NOW()
                         WHERE id = ?`,
                        [accountId]
                    );
                }
                throw new Error("Không tìm thấy tài khoản vừa khóa, có thể có lỗi logic.");
            }

            const account: AccountRow = getRow[0];
            accountId = account.id;
            let fileData: AccountMetaData = JSON.parse(account.meta);
            const email = fileData.email;
            const createdAtToken = fileData.created_at ? fileData.created_at : 0;

            if (fileData.api_key) {
                let getUser = true;
                if (new Date().getTime() - createdAtToken * 1000 > 7 * 24 * 60 * 60 * 1000) {
                    getUser = await getToken.getInfo(fileData.api_key, agent);
                    if (!getUser) {
                        console.log('token piclumen expried');
                    }
                }

                if (new Date().getTime() - new Date(account.updated_at).getTime() > 24 * 60 * 60 * 1000) {
                    await getToken.reward(fileData.api_key, agent);
                }

                if (getUser) {
                    return fileData.api_key;
                }
            }

            const password = fileData.password;
            const url = `https://api.piclumen.com/api/user/login`;

            const formData = new FormData();
            formData.append('account', email || '');
            formData.append('password', password || '');

            interface PiclumenLoginResponse {
                data?: {
                    token?: string;
                };
                message?: string;
            }

            const res: AxiosResponse<PiclumenLoginResponse> = await axios.post(url, formData, {
                httpsAgent: agent,
                headers: {
                    ...(typeof formData.getHeaders === 'function' ? formData.getHeaders() : {}),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0',
                    'platform': 'Web',
                    'referer': 'https://piclumen.com/',
                    'authorization': '',
                    'sec-ch-ua-platform': '"Windows"',
                },
            });
            const returnToken = res.data?.data?.token || null;

            if (!returnToken) {
                if (res.data.message?.includes("Incorrect")) {
                    // Using Database.pool.query directly for DELETE
                    await Database.pool.query<ResultSetHeader>("DELETE FROM accounts WHERE id = ?", [account.id]);
                    Log.error("❌ Tài khoản Piclumen không hợp lệ:");
                }
                return await getToken.piclumen(run + 1);
            }

            fileData.created_at = new Date().getTime() / 1000;
            fileData.api_key = returnToken;
            // Using Database.pool.query directly for UPDATE
            await Database.pool.query<ResultSetHeader>(
                "UPDATE accounts SET meta = ?, updated_at = NOW() WHERE id = ?",
                [JSON.stringify(fileData), account.id]
            );

            getToken.reward(returnToken, agent);
            return returnToken;
        } catch (error: any) {
            Log.error('❌ Lỗi khi lấy token Piclumen:');
            return await getToken.piclumen(run + 1);
        } finally {
            if (accountId) {
                console.log(`Releasing lock for account ID: ${accountId}`);
                // Using Database.pool.query directly for UPDATE
                await Database.pool.query<ResultSetHeader>(
                    `UPDATE accounts
                     SET
                        processing_status = 0,
                        locked_by_worker = NULL,
                        locked_at = NULL,
                        updated_at = NOW()
                     WHERE id = ?`,
                    [accountId]
                );
            }
        }
    },

    reward: async (token: string, agent: Agent): Promise<any> => {
        const url = `https://api.piclumen.com/api/lumen-task/receive-task-reward`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            'platform': 'Web',
            'referer': 'https://piclumen.com/',
            'Content-Type': 'application/json',
            'Authorization': `${token}`,
        };
        try {
            interface RewardResponse {
                status: number;
                data: any;
                message?: string;
            }
            const response: AxiosResponse<RewardResponse> = await axios.post(url, ["1"], { headers, httpsAgent: agent });
            if (response.data.status === 0) {
                return response.data.data;
            } else {
                Log.error(`Error updating user info:`);
            }
        } catch (error: any) {
            Log.error(`Error updating user info:`);
        }
    },

    getInfo: async (token: string, agent: Agent, run = 0): Promise<boolean | null> => {
        if (run > 3) {
            Log.error("❌ Đã thử quá 5 lần, không thể tạo token.");
            return null;
        }
        try {
            const url = `https://api.piclumen.com/api/user/info`;
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                'platform': 'Web',
                'referer': 'https://piclumen.com/',
                'Content-Type': 'application/json',
                'Authorization': `${token}`,
            };
            try {
                interface GetInfoResponse {
                    status: number;
                }
                const response: AxiosResponse<GetInfoResponse> = await axios.get(url, { headers, httpsAgent: agent });
                return response.data.status === 0;
            } catch (error: any) {
                Log.error(`Error updating user info:`);
                return false;
            }
        } catch (error: any) {
            Log.error('❌ Lỗi khi lấy token Piclumen:');
            return await getToken.getInfo(token, agent, run + 1);
        }
        return false;
    },

    digenRemain: async (token: string | null, agent: Agent): Promise<any> => {
        try {
            const url = `https://api.digen.ai/v1/credit/reward?action=Login`;
            interface DigenRemainResponse {
                data: any;
            }
            const response: AxiosResponse<DigenRemainResponse> = await axios.post(url, {}, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                    'Content-Type': 'application/json',
                    'digen-sessionid': uuidv4(),
                    'digen-token': token || '',
                    'digen-language': 'en-US',
                    'cookie': 'BLUR_NSFW=2; digen_unique_id=' + uuidv4() + '; DISPLAY_NSFW=2'
                },
                httpsAgent: agent,
            });
            return response.data.data;
        } catch (error: any) {
            Log.error('❌ Lỗi khi lấy token Digen:');
            return null;
        }
    },

    getCodeDigen: async (token: string, agent: Agent): Promise<string | null> => {
        const url = `https://api.digen.ai/v1/user/scene_info`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            'Content-Type': 'application/json',
            'digen-sessionid': uuidv4(),
            'digen-token': token,
            'digen-language': 'en-US'
        };
        interface GetCodeDigenResponse {
            data: {
                code?: string;
            };
        }
        const res: AxiosResponse<GetCodeDigenResponse> = await axios.post(url, {}, { headers, httpsAgent: agent });
        const data = res.data;
        return data.data.code || null;
    },

    digenGetJob: async (jobId: string, token: string, agent: Agent): Promise<any> => {
        try {
            const url = `https://api.digen.ai/v3/video/job/list_by_job_id?job_id=${jobId}`;
            interface DigenGetJobResponse {
                data: any;
            }
            const response: AxiosResponse<DigenGetJobResponse> = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                    'Content-Type': 'application/json',
                    'digen-sessionid': uuidv4(),
                    'digen-token': token,
                    'digen-language': 'en-US'
                },
                httpsAgent: agent,
            });
            const item = response.data.data;
            return item;
        } catch (error: any) {
            Log.error('❌ Lỗi khi lấy token Digen:');
            return null;
        }
    },

    digen: async (run = 0, filePathOne?: number | null, agent: Agent | null = null): Promise<string | boolean | null> => {
        if (run >= 6) {
            console.log('❌ Lỗi khi lấy token Digen: Quá số lần thử');
            return null;
        }
        const workerId = uuidv4();
        let accountId: number | null = null;
        try {
            if (!agent) agent = await getAgent();
            let getRow: AccountRow[] = [];
            if (filePathOne) {
                // Using Database.pool.query directly for SELECT
                const [rows] = await Database.pool.query<AccountRow[]>("SELECT * FROM accounts WHERE platform = 'digen' AND id = ? ORDER BY updated_at ASC LIMIT 1", [filePathOne]);
                getRow = rows;
            } else {
                // Using Database.pool.query directly for UPDATE
                const [updateResult] = await Database.pool.query<ResultSetHeader>(
                    `UPDATE accounts
                     SET
                        processing_status = 1,
                        locked_by_worker = ?,
                        locked_at = NOW()
                     WHERE
                        platform = 'digen' AND
                        processing_status = 0
                     ORDER BY updated_at ASC
                     LIMIT 1;`,
                    [workerId]
                );

                if (updateResult.affectedRows === 0) {
                    console.log("⚠️ Không có tài khoản nào khả dụng tại thời điểm này.");
                    return null;
                }

                // Using Database.pool.query directly for SELECT
                const [rows] = await Database.pool.query<AccountRow[]>(
                    `SELECT * FROM accounts WHERE locked_by_worker = ?`,
                    [workerId]
                );
                getRow = rows;
            }

            if (getRow.length === 0) {
                if (accountId) {
                    // Using Database.pool.query directly for UPDATE
                    await Database.pool.query<ResultSetHeader>(
                        `UPDATE accounts
                         SET
                            processing_status = 0,
                            locked_by_worker = NULL,
                            locked_at = NULL,
                            updated_at = NOW()
                         WHERE id = ?`,
                        [accountId]
                    );
                }
                return false;
            }

            const account: AccountRow = getRow[0];
            accountId = account.id;
            let fileContent: AccountMetaData = JSON.parse(account.meta);

            if (fileContent.token_did) {
                console.log(`Token Digen found in file: ${fileContent.token_did}`);
                const createdAtToken = fileContent.created_at ? fileContent.created_at * 1000 : 0;
                let check = true;
                if (new Date().getTime() - createdAtToken > 7 * 24 * 60 * 60 * 1000) {
                    check = false;
                }

                if (check) {
                    const remain = await getToken.digenRemain(fileContent.token_did, agent);
                    console.log(`Digen credits remain:`, remain)
                    return fileContent.token_did;
                }
            }
            const email = fileContent.email;
            const password = fileContent.password;
            const url = `https://api.digen.ai/v1/user/login`;
            const data = { "email": email, "password": password, invite_code: '' };

            interface DigenLoginResponse {
                data: {
                    token: string;
                };
            }
            const response: AxiosResponse<DigenLoginResponse> = await axios.post(url, data, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                    'Content-Type': 'application/json',
                    'digen-sessionid': uuidv4(),
                    'digen-language': 'en-US',
                    'cookie': 'BLUR_NSFW=2; digen_unique_id=' + uuidv4() + '; DISPLAY_NSFW=2'
                },
                httpsAgent: agent,
            });

            const token = response.data.data.token;
            fileContent.token_did = token;
            fileContent.created_at = new Date().getTime() / 1000;
            // Using Database.pool.query directly for UPDATE
            await Database.pool.query<ResultSetHeader>("UPDATE accounts SET meta = ?, updated_at = NOW() WHERE id = ?", [JSON.stringify(fileContent), account.id]);
            await getToken.digenRemain(token, agent);
            console.log(`Token Digen obtained successfully: ${token}`);
            return token;
        } catch (error: any) {
            Log.error('❌ Lỗi khi lấy token Digen:');
            return await getToken.digen(run + 1, filePathOne);
        } finally {
            if (accountId) {
                console.log(`Releasing lock for account ID: ${accountId}`);
                // Using Database.pool.query directly for UPDATE
                await Database.pool.query<ResultSetHeader>(
                    `UPDATE accounts
                     SET
                        processing_status = 0,
                        locked_by_worker = NULL,
                        locked_at = NULL,
                        updated_at = NOW()
                     WHERE id = ?`,
                    [accountId]
                );
            }
        }
    },

    deleteJobDigen: async (jobId: string, token: string, agent: Agent): Promise<void> => {
        const url = `https://api.digen.ai/v3/video/job/delete`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            'Content-Type': 'application/json',
            'digen-sessionid': uuidv4(),
            'digen-token': token,
            'digen-language': 'en-US'
        };
        const data = {
            "jobID": jobId
        };
        try {
            await axios.post(url, data, { headers, httpsAgent: agent });
        } catch (error: any) {
            Log.error(`Error deleteJobDigen:`);
        }
    },

    postJob: async (data: any, token: string, agent: Agent): Promise<{ jobId: string; token: string } | null> => {
        try {
            const getCode = await getToken.getCodeDigen(token, agent);
            let scene_params: any;
            try {
                scene_params = JSON.parse(data.scene_params);
            } catch (e) {
                Log.error('Error parsing scene_params:',);
                return null;
            }

            scene_params.code = getCode;
            data.scene_params = JSON.stringify(scene_params);

            const url = `https://api.digen.ai/v1/scene/job/submit`;
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                'Content-Type': 'application/json',
                'digen-sessionid': uuidv4(),
                'digen-token': token,
                'digen-language': 'en-US'
            };

            interface PostJobResponse {
                data: {
                    jobId?: string;
                };
                errMsg?: string;
            }

            const response: AxiosResponse<PostJobResponse> = await axios.post(url, data, {
                headers: headers,
                httpsAgent: agent,
            });

            const dataResponse = response.data;
            console.log(`Job created successfully. Job ID: ${dataResponse.data.jobId}`);

            if (!dataResponse.data.jobId) {
                if (dataResponse.errMsg === "Exceed the concurrency limit!") {
                    const getTokenNew = await getToken.digen();
                    if (typeof getTokenNew === 'string' && getTokenNew) {
                        return await getToken.postJob(data, getTokenNew, agent);
                    } else {
                        Log.error('Failed to get new Digen token for retry.');
                        return null;
                    }
                }
                return null;
            }

            return {
                jobId: dataResponse.data.jobId,
                token: token,
            };
        } catch (error: any) {
            Log.error('❌ Lỗi khi tạo job Digen:');
            return null;
        }
    }
};

export default getToken;
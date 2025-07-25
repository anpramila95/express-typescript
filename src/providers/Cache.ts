/**
 * Cung cấp cache middleware và các phương thức cache tĩnh.
 *
 * @author Faiz A. Farooqui <faiz@geekyants.com>
 * @author (Your Name - for modifications)
 */

import * as mcache from 'memory-cache';
import { Request, Response, NextFunction } from 'express';
import Log from '../middlewares/Log';

// Mở rộng interface của Express Response để thêm sendResponse
// Điều này giúp TypeScript không báo lỗi
declare module 'express-serve-static-core' {
    interface Response {
        sendResponse?: Response['send']
    }
}

class Cache {
    /**
     * == PHƯƠNG THỨC MỚI: Lấy một giá trị từ cache ==
     * @param key Chìa khóa để truy xuất
     * @returns Giá trị được cache hoặc `null` nếu không tìm thấy.
     */
    public static get(key: string): any {
        const cachedValue = mcache.get(key);
        if (cachedValue) {
            Log.info(`[Cache] HIT: Lấy giá trị từ cache cho key '${key}'`);
            return cachedValue;
        }
        Log.info(`[Cache] MISS: Không tìm thấy giá trị trong cache cho key '${key}'`);
        return null;
    }

    /**
     * == PHƯƠNG THỨC MỚI: Lưu một giá trị vào cache ==
     * @param key Chìa khóa để lưu
     * @param value Giá trị cần lưu
     * @param duration Thời gian tồn tại (tính bằng giây). Mặc định là 1 giờ.
     * @returns `true` nếu lưu thành công.
     */
    public static set(key: string, value: any, duration: number = 3600): boolean {
        Log.info(`[Cache] SET: Đang lưu giá trị cho key '${key}' với TTL là ${duration} giây.`);
        return mcache.put(key, value, duration * 1000); // memory-cache dùng miligiây
    }
    
    /**
     * == MIDDLEWARE HIỆN CÓ (GIỮ NGUYÊN) ==
     * Middleware để cache toàn bộ response của một route.
     * @param _duration Thời gian cache (tính bằng giây).
     */
    public cache(_duration: number): any {
        return (req: Request, res: Response, next: NextFunction) => {
            let key = '__express__' + req.originalUrl || req.url;

            let cachedBody = mcache.get(key);
            if (cachedBody) {
                res.send(cachedBody);
                return;
            } else {
                res.sendResponse = res.send;
                res.send = (body) => {
                    mcache.put(key, body, _duration * 1000);
                    return res.sendResponse!(body);
                };
                next();
            }
        };
    }
}

export default Cache;
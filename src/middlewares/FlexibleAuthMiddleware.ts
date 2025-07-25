import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import Locals from "../providers/Locals";
import ApiKey from "../models/ApiKey";
import Site from "../models/Site";
import Log from "./Log";
import { default as StaticCache } from '../providers/Cache'; // Import với tên khác để rõ ràng

class FlexibleAuthMiddleware {
  /**
   * Helper riêng để lấy thông tin site, có tích hợp cache.
   * Dữ liệu site sẽ được cache trong 1 giờ.
   */
  private static async _getAndCacheSiteInfo(domain: string): Promise<any> {
    const cacheKey = `site_info_${domain}`;

    // Thử lấy từ cache trước
    const cachedSite = await StaticCache.get(cacheKey);
    if (cachedSite) {
      Log.info(`[Cache] Lấy thông tin site từ cache cho domain: ${domain}`);
      return cachedSite;
    }

    // Nếu không có trong cache, truy vấn database
    Log.info(`[Database] Truy vấn thông tin site cho domain: ${domain}`);
    const site = await Site.findByDomain(domain);
    if (site) {
      // Lưu vào cache cho lần gọi sau (mặc định là 1 giờ)
      StaticCache.set(cacheKey, site, 3600);
    }

    return site;
  }

  /**
   * Middleware xác thực request bằng Access Token (JWT) hoặc API Key.
   */
  public static async authenticate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<any> {
    const domain = req.hostname;
    
    // <-- 2. Sử dụng helper để lấy thông tin site
    const site = await FlexibleAuthMiddleware._getAndCacheSiteInfo(domain);
    if (!site) {
      return res.status(404).json({ error: "Site not found." });
    }
    req.site = site; // Gắn thông tin site vào req

    // --- Bước 1: Thử xác thực bằng Access Token (JWT) ---
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7, authHeader.length);

      try {
        const decoded = jwt.verify(token, Locals.config().appSecret);
        req.user = decoded;
        Log.info("Request authenticated with JWT.");
        return next();
      } catch (err) {
        return res.status(401).json({ error: "Unauthorized: Invalid Access Token." });
      }
    }

    // --- Bước 2: Nếu không có JWT, thử xác thực bằng API Key ---
    const apiKey = req.header("x-api-key");
    if (apiKey) {
      try {
        const authenticatedUser = await ApiKey.findByKey(apiKey, site.id); // <-- Thêm site.id để tăng bảo mật
        if (authenticatedUser) {
          req.user = authenticatedUser;
          Log.info("Request authenticated with API Key.");
          return next();
        }
      } catch (error) {
        return res.status(500).json({ error: "Server error during API Key authentication." });
      }
    }

    // --- Bước 3: Nếu cả hai đều thất bại ---
    return res.status(401).json({ error: "Unauthorized: Authentication is required." });
  }

  public static async authorizeAdminSite(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<any> {
    const user = req.user as any;
    if (!user) {
        return res.status(401).json({ error: "Unauthorized: Authentication required." });
    }

    // Admin toàn cục có quyền truy cập mọi site
    if (user.isAdmin) {
      return next();
    }
    
    // Nếu req.site đã được middleware `authenticate` gắn vào thì dùng lại,
    // nếu không thì lấy lại (có cache)
    if (!req.site) {
        const domain = req.hostname;
        const site = await FlexibleAuthMiddleware._getAndCacheSiteInfo(domain);
        if (!site) {
            return res.status(404).json({ error: "Site not found." });
        }
        req.site = site;
    }
    
    // Kiểm tra xem user có phải là chủ sở hữu của site này không
    if (req.site.user_id !== user.id) {
        return res.status(403).json({ error: "Forbidden: You do not have admin access to this site." });
    }

    return next();
  }
}

export default FlexibleAuthMiddleware;
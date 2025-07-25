import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import Locals from "../providers/Locals";
import ApiKey from "../models/ApiKey";
import Site, { ISite } from '../models/Site'; // Import model và interface ISite của bạn
import Log from "./Log";
import { default as StaticCache } from '../providers/Cache'; // Import với tên khác để rõ ràng

class FlexibleAuthMiddleware {
  private static async checkSiteAndUser(site: { id: any; user_id: any; }, user: { site_id: any; id: any; }) {
    
    if (!site) {
      Log.error("Site not found for the request.");
      throw new Error("Site not found.");
    }

    if (!user) {
      Log.error("User not found for the request.");
      throw new Error("User not found.");
    }

    // Kiểm tra xem user có thuộc về site này không
    if (user.site_id !== site.id && user.id !== site.user_id ) {
      Log.warn(`User ID ${user.id} does not belong to site ID ${site.id}.`);
      throw new Error("User does not belong to this site.");
    }
  }
  /**
   * Helper riêng để lấy thông tin site, có tích hợp cache.
   * Dữ liệu site sẽ được cache trong 1 giờ.
   */
  private static async _getAndCacheSiteInfo(domain: string): Promise<ISite | null> {
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

    return site as ISite | null;
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
    
    (req as any).site = site;

    // --- Bước 1: Thử xác thực bằng Access Token (JWT) ---
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7, authHeader.length);

      try {
        const decoded = jwt.verify(token, Locals.config().appSecret);
        (req as any).user = decoded;
        //check userid and site checkSiteAndUser
        await FlexibleAuthMiddleware.checkSiteAndUser(site, decoded);
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
        const authenticatedUser = await ApiKey.findByKey(apiKey); // <-- Thêm site.id để tăng bảo mật
        if (authenticatedUser) {
          (req as any).user = authenticatedUser;
          await FlexibleAuthMiddleware.checkSiteAndUser(site, authenticatedUser);
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

}

export default FlexibleAuthMiddleware;
/**
 * Site Utilities - Helper functions để làm việc với multi-site
 * 
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import { Request } from 'express';
import { ISite } from '../models/Site';
import Site from '../models/Site';

export class SiteUtils {
    /**
     * Lấy site_id từ request (đã được inject bởi TenantResolver middleware)
     */
    public static getSiteId(req: Request): number {
        const site = req.site as ISite;
        if (!site) {
            throw new Error('Site information not found in request. Make sure TenantResolver middleware is applied.');
        }
        return site.id;
    }

    /**
     * Lấy site object từ request
     */
    public static getSite(req: Request): ISite {
        const site = req.site as ISite;
        if (!site) {
            throw new Error('Site information not found in request. Make sure TenantResolver middleware is applied.');
        }
        return site;
    }

    /**
     * Kiểm tra xem user có phải là owner của site hiện tại không
     */
    public static isUserSiteOwner(req: Request, userId: number): boolean {
        const site = req.site as ISite;
        if (!site) {
            return false;
        }
        return site.user_id === userId;
    }

    /**
     * Kiểm tra xem user có quyền admin trên site hiện tại không
     * (có thể là owner hoặc admin toàn cục)
     */
    public static async hasAdminAccess(req: Request, userId: number, isGlobalAdmin: boolean = false): Promise<boolean> {
        // Admin toàn cục luôn có quyền
        if (isGlobalAdmin) {
            return true;
        }

        const site = req.site as ISite;
        if (!site) {
            return false;
        }

        // Kiểm tra xem user có phải là owner của site không
        return site.user_id === userId;
    }

    /**
     * Validate site_id trong các operations CRUD
     */
    public static validateSiteAccess(req: Request, resourceSiteId: number): boolean {
        const currentSiteId = this.getSiteId(req);
        return currentSiteId === resourceSiteId;
    }

    /**
     * Tạo response context với thông tin site
     */
    public static createSiteContext(req: Request) {
        const site = this.getSite(req);
        return {
            site_id: site.id,
            site_domain: site.domain,
            site_owner_id: site.user_id
        };
    }

    /**
     * Helper để log actions với site context
     */
    public static logWithSiteContext(req: Request, message: string, data?: any) {
        const site = this.getSite(req);
        const logMessage = `[Site: ${site.domain}(${site.id})] ${message}`;
        
        if (data) {
            console.log(logMessage, data);
        } else {
            console.log(logMessage);
        }
    }

    /**
     * Middleware helper để check site permissions
     */
    public static createSitePermissionChecker(requiredPermission: 'owner' | 'admin' = 'owner') {
        return async (req: Request, res: any, next: any) => {
            try {
                const user = req.user as any;
                if (!user) {
                    return res.status(401).json({ error: 'Authentication required' });
                }

                const hasAccess = await this.hasAdminAccess(
                    req, 
                    user.id, 
                    user.isAdmin || false
                );

                if (!hasAccess) {
                    return res.status(403).json({ 
                        error: 'You do not have permission to access this resource on this site.' 
                    });
                }

                next();
            } catch (error) {
                return res.status(500).json({ error: 'Error checking site permissions' });
            }
        };
    }

    /**
     * Filter data array theo site_id
     */
    public static filterBySite<T extends { site_id: number }>(data: T[], req: Request): T[] {
        const siteId = this.getSiteId(req);
        return data.filter(item => item.site_id === siteId);
    }

    /**
     * Add site_id vào data object
     */
    public static addSiteId<T extends object>(data: T, req: Request): T & { site_id: number } {
        const siteId = this.getSiteId(req);
        return { ...data, site_id: siteId };
    }

    /**
     * Validate và prepare data cho database operations
     */
    public static prepareSiteData<T extends object>(data: T, req: Request): T & { site_id: number } {
        const siteId = this.getSiteId(req);
        
        // Remove any existing site_id to prevent conflicts
        const cleanData = { ...data };
        delete (cleanData as any).site_id;
        
        return { ...cleanData, site_id: siteId } as T & { site_id: number };
    }
}

export default SiteUtils;

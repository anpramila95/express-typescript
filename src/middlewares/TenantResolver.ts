import { Request, Response, NextFunction } from 'express';
import Site, { ISite } from '../models/Site'; // Import model và interface ISite của bạn

export const resolveTenant = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const hostname = req.hostname; // Lấy hostname từ request, vd: 'app.customer.com'

        // Sử dụng hàm findByDomain từ model Site của bạn
        const site: ISite | null = await Site.findByDomain(hostname);
        
        if (!site) {
            // Nếu không tìm thấy site, trả về lỗi 404.
            // Bạn có thể tùy chỉnh để chuyển hướng đến trang chủ của platform chính.
            return res.status(404).json({ error: `Site with domain '${hostname}' not found.` });
        }

        // Gắn toàn bộ object site (ISite) vào request để sử dụng sau này
        (req as any).site = site;
        
        return next();

    } catch (error) {
        // Ghi lại lỗi nếu có sự cố trong quá trình tìm kiếm
        console.error(`Tenant resolver error for hostname ${req.hostname}:`, error);
        return res.status(500).json({ error: 'Internal server error while resolving site.' });
    }
};
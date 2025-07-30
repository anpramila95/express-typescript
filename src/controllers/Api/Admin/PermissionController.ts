import { Request, Response } from 'express';
import Permission from '../../../models/Permission';

class PermissionController {
    public static async list(req: Request, res: Response): Promise<Response> {
        const permissions = await Permission.listAll();
        return res.json({ permissions });
    }

    public static async create(req: Request, res: Response): Promise<Response> {
        const { name, description } = req.body;
        if (!name) {
            return res.status(400).json({ error: req.__('permission.name_required') });
        }
        try {
            const result = await Permission.create(name, description);
            return res.status(201).json({ message: req.__('permission.create_success'), permissionId: result.id });
        } catch (error) {
            return res.status(409).json({ error: error.message });
        }
    }
}

export default PermissionController;
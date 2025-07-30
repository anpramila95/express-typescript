import { Request, Response } from 'express';
import Role from '../../../models/Role';
import { IUser } from '../../../interfaces/models/user';

class RoleController {
    // Lấy danh sách vai trò của site hiện tại
    public static async list(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        const roles = await Role.findBySiteId(user.site_id);
        return res.json({ roles });
    }

    // Tạo vai trò mới
    public static async create(req: Request, res: Response): Promise<Response> {
        const user = req.user as IUser;
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: req.__('role.name_required') });
        }

        const result = await Role.create(user.site_id, name, description);
        return res.status(201).json({ message: req.__('role.create_success'), roleId: result.id });
    }

    /**
     * Gán một hoặc nhiều quyền cho một vai trò.
     */
    public static async assignPermissions(req: Request, res: Response): Promise<Response> {
        // Lấy thông tin người dùng đang đăng nhập (Site Admin)
        const siteAdmin = req.user as IUser;
        const { roleId } = req.params;
        const { permissionIds } = req.body; // permissionIds là một mảng các ID

        if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
            return res.status(400).json({ error: req.__('role.permission_ids_required') });
        }

        try {
            // ---- BẮT ĐẦU PHẦN KIỂM TRA (TODO) ----

            // 1. Tìm vai trò trong database bằng roleId từ params
            const role = await Role.findById(Number(roleId));

            // 2. Nếu không tìm thấy vai trò, trả về lỗi 404
            if (!role) {
                return res.status(404).json({ error: req.__('role.role_not_found') });
            }

            // 3. So sánh site_id của vai trò với site_id của admin đang thao tác
            if (role.site_id !== siteAdmin.site_id) {
                // Nếu không khớp, admin này không có quyền chỉnh sửa vai trò của site khác
                return res.status(403).json({ error: req.__('role.no_permission_edit') });
            }

            // ---- KẾT THÚC PHẦN KIỂM TRA ----


            // Nếu mọi thứ đều hợp lệ, tiến hành gán quyền
            for (const permId of permissionIds) {
                // `assignPermission` đã được viết ở các bước trước
                await Role.assignPermission(Number(roleId), Number(permId));
            }

            return res.json({ message: req.__('role.assign_permissions_success') });

        } catch (error) {
            return res.status(500).json({ error: req.__('role.assign_permissions_error') });
        }
    }
}

export default RoleController;
import { Request, Response } from 'express';
import User from '../../../models/User';
import { IUser } from '../../../interfaces/models/user';
import Role from '../../../models/Role';
class UserManagementController {
   /**
     * Gán một vai trò cho một người dùng trong cùng một site.
     */
    public static async assignRole(req: Request, res: Response): Promise<Response> {
        const siteAdmin = req.user as IUser;
        const { userId } = req.params; // ID của người dùng cần được gán vai trò
        const { roleId } = req.body;

        if (!roleId) {
            return res.status(400).json({ error: req.__('user_management.role_id_required') });
        }
        
        try {
            // ---- BẮT ĐẦU PHẦN KIỂM TRA (TODO) ----

            // 1. Lấy thông tin của người dùng mục tiêu và vai trò mục tiêu
            const targetUser = await User.findById(Number(userId));
            const targetRole = await Role.findById(roleId);

            // 2. Kiểm tra xem user và role có tồn tại không
            if (!targetUser) {
                return res.status(404).json({ error: req.__('user_management.user_not_found') });
            }
            if (!targetRole) {
                return res.status(404).json({ error: req.__('user_management.role_not_found') });
            }

            // 3. Kiểm tra chéo: Cả user và role đều phải thuộc site của admin
            if (targetUser.site_id !== siteAdmin.site_id) {
                return res.status(403).json({ error: req.__('user_management.no_permission_user') });
            }

            if (targetRole.site_id !== siteAdmin.site_id) {
                return res.status(403).json({ error: req.__('user_management.no_permission_role') });
            }

            // ---- KẾT THÚC PHẦN KIỂM TRA ----

            // Nếu mọi thứ hợp lệ, tiến hành gán vai trò
            await User.assignRole(Number(userId), roleId, siteAdmin.site_id);

            return res.json({ message: req.__('user_management.assign_role_success') });

        } catch (error) {
            return res.status(500).json({ error: req.__('user_management.assign_role_error') });
        }
    }

    /**
     * Site Admin tạo một người dùng mới cho Site của mình.
     */
    public static async createUser(req: Request, res: Response): Promise<Response> {
        const siteAdmin = req.user as IUser;
        const { fullname, email, password, roleId } = req.body;

        // 1. Kiểm tra dữ liệu đầu vào
        if (!fullname || !email || !password || !roleId) {
            return res.status(400).json({ error: req.__('user_management.user_info_required') });
        }

        try {
            // 2. Kiểm tra xem vai trò (roleId) có hợp lệ và thuộc site của admin không
            const roleToAssign = await Role.findById(roleId);
            if (!roleToAssign || roleToAssign.site_id !== siteAdmin.site_id) {
                return res.status(403).json({ error: req.__('user_management.invalid_role') });
            }

            // 3. Tạo người dùng mới
            const newUser = await User.create({
                fullname,
                email,
                password,
                site_id: siteAdmin.site_id,
                isAdmin: false
            });

            // 4. Gán vai trò cho người dùng vừa tạo
            await User.assignRole(newUser.id, roleId, siteAdmin.site_id);

            return res.status(201).json({ 
                message: req.__('user_management.create_user_success'),
                userId: newUser.id 
            });

        } catch (error) {
            // Bắt lỗi từ User.create (ví dụ: email đã tồn tại)
            return res.status(409).json({ error: error.message });
        }
    }
}

export default UserManagementController;
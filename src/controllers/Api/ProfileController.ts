import { Request, Response } from 'express';
import User from '../../models/User';
import Log from '../../middlewares/Log';

interface AuthenticatedUser {
    id: number;
    email: string;
}

class ProfileController {
    public static async update(req: Request, res: Response): Promise<Response> {
        const user = req.user as unknown as AuthenticatedUser;

        // Lấy các trường có thể cập nhật từ body
        const { fullname, gender, geolocation, website, picture } = req.body;

        try {
            const userToUpdate = await User.findById(user.id);
            if (!userToUpdate) {
                return res.status(404).json({ error: req.__('user.not_found') });
            }

            const data = {
                fullname: fullname || userToUpdate.fullname,
                gender: gender || userToUpdate.gender,
                geolocation: geolocation || userToUpdate.geolocation,
                website: website || userToUpdate.website,
                picture: picture || userToUpdate.picture
            };
            //update 
            await User.update(data,user.id);
            
            return res.json({
                message: req.__('profile.update_success')
            });
        } catch (error) {
            Log.error(`[ProfileController] ${error.stack}`);
            return res.status(500).json({ error: req.__('profile.update_error') });
        }
    }
}

export default ProfileController;
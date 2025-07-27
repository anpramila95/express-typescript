import { IUser } from '../../interfaces/models/user';
import Log from '../../middlewares/Log';
import { ISite } from '../../models/Site';

class UserListener {
    /**
     * Xử lý khi có sự kiện user được tạo
     */
    public static onUserCreated({ user }: { user: IUser }): void {
        Log.info(`EVENT [user.created]: User #${user.id} - ${user.email} has been created.`);

        // TODO: GỌI WEBHOOK TẠI ĐÂY
        // Ví dụ:
        // WebhookService.send('user.created', { user });

        // TODO: GỬI EMAIL CHÀO MỪNG
        // Ví dụ:
        // EmailService.sendWelcomeEmail(user.email, user.fullname);
    }

    /**
     * Xử lý khi user cập nhật profile
     */
    public static onUserUpdated({ user }: { user: IUser }): void {
        Log.info(`EVENT [user.updated]: User #${user.id} has been updated.`);
        // ...
    }

    public static onUserLoggedIn({ user, site }: { user: IUser, site: ISite }): void {
        Log.info(`EVENT [user.loggedIn]: User #${user.id} - ${user.email} has logged in on site #${site.id}.`);
    }
}

export default UserListener;
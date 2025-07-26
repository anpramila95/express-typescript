import { Request, Response } from 'express';
import * as crypto from 'crypto';
import User from '../../../models/User';
import MailService from '../../../services/MailService';
import Log from '../../../middlewares/Log';

class PasswordController {
    public static async forgot(req: Request, res: Response): Promise<Response> {
        req.assert('email', 'Email is not valid').isEmail();
        const errors = req.validationErrors();
        if (errors) {
            return res.status(400).json({ errors });
        }

        const email = req.body.email.toLowerCase();

        try {
            const user = await User.findOne({ email });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const token = crypto.randomBytes(20).toString('hex');
            user.passwordResetToken = token;
            user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour

            await user.save();

            const resetUrl = `http://${req.headers.host}/reset/${token}`;
            const message = `<p>You are receiving this email because you (or someone else) have requested the reset of the password for your account.</p>
                             <p>Please click on the following link, or paste this into your browser to complete the process:</p>
                             <a href="${resetUrl}">${resetUrl}</a>
                             <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`;

            await MailService.sendMail(user.email, 'Password Reset', message);

            return res.json({ message: 'An e-mail has been sent to ' + user.email + ' with further instructions.' });
        } catch (error) {
            Log.error(`[PasswordController] ${error.stack}`);
            return res.status(500).json({ error: 'Server error' });
        }
    }

    public static async reset(req: Request, res: Response): Promise<Response> {
        req.assert('password', 'Password must be at least 8 characters long').isLength({ min: 8 });
        const errors = req.validationErrors();
        if (errors) {
            return res.status(400).json({ errors });
        }

        const { token } = req.params;
        const { password } = req.body;

        try {
            // Find user by email first, then check token and expiry manually
            const user = await User.findByPasswordResetToken(token);

            if (!user) {
                return res.status(400).json({ error: 'Password reset token is invalid or has expired.' });
            }

            user.password = password;
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;

            await user.save();

            await MailService.sendMail(user.email, 'Your password has been changed', `<p>This is a confirmation that the password for your account ${user.email} has just been changed.</p>`);

            return res.json({ message: 'Success! Your password has been changed.' });
        } catch (error) {
            Log.error(`[PasswordController] ${error.stack}`);
            return res.status(500).json({ error: 'Server error' });
        }
    }
}

export default PasswordController;
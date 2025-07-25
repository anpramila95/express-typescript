/**
 * Refresh JWToken
 *
 * @author Faiz A. Farooqui <faiz@geekyants.com> - Adapted for MySQL
 */

import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import User from '../../../models/User';
import Log from '../../../middlewares/Log';

interface ITokenPayload {
    id: number;
    email: string;
    iat: number;
    exp: number;
}

class RefreshToken {
    public static async perform(req: Request, res: Response): Promise<any> {
        // req.user is populated by express-jwt middleware
        const decoded = req.user as unknown as ITokenPayload;

        if (!decoded || !decoded.id) {
            return res.status(401).json({ error: 'Invalid token payload!' });
        }

        try {
            const user = await User.findById(decoded.id);

            if (!user) {
                return res.status(404).json({ error: 'User not found!' });
            }

            // Create a new token
            const newToken = jwt.sign(
                { id: user.id, email: user.email },
                res.locals.app.appSecret,
                { expiresIn: res.locals.app.jwtExpiresIn * 60 }
            );

            // Hide protected columns before sending response
            user.password = undefined;
            user.tokens = undefined;

            return res.status(200).json({
                user,
                token: newToken,
                token_expires_in: res.locals.app.jwtExpiresIn * 60
            });

        } catch (error) {
            Log.error(error.message);
            return res.status(500).json({ error: 'Failed to refresh token.' });
        }
    }
}

export default RefreshToken;
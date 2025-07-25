/**
 * Define Login Logic for the API
 *
 * @author Faiz A. Farooqui <faiz@geekyants.com>
 */

import * as jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

import User from '../../../models/User';
import Log from '../../../middlewares/Log';

class Login {
	public static async perform (req: Request, res: Response): Promise<any> {
		req.assert('email', 'E-mail cannot be blank').notEmpty();
		req.assert('email', 'E-mail is not valid').isEmail();
		req.assert('password', 'Password cannot be blank').notEmpty();
		req.assert('password', 'Password length must be at least 8 characters').isLength({ min: 8 });
		req.sanitize('email').normalizeEmail({ gmail_remove_dots: false });

		const errors = req.validationErrors();
		if (errors) {
			return res.status(400).json({ errors });
		}

		try {
			const email = req.body.email.toLowerCase();
			const password = req.body.password;

			const user = await User.findOne({ email: email });
			if (!user) {
				return res.status(404).json({
					error: 'User not found!'
				});
			}

			if (!user.password) {
				return res.status(401).json({
					error: 'Please login using your social credentials.'
				});
			}

			const isMatch = await user.comparePassword(password);
			if (!isMatch) {
				return res.status(401).json({
					error: 'Password does not match!'
				});
			}

			// Lấy giá trị isAdmin từ đối tượng user trong database
            const isAdmin = user.isAdmin ? true : false;

			const token = jwt.sign(
				{ email: user.email, id: user.id, isAdmin: isAdmin},
				res.locals.app.appSecret,
				{ expiresIn: res.locals.app.jwtExpiresIn * 60 }
			);

			// Hide protected columns
			user.password = undefined;
			user.tokens = undefined;

			return res.json({
				user,
				token,
				token_expires_in: res.locals.app.jwtExpiresIn * 60
			});

		} catch (err) {
            Log.error(err.message);
			return res.status(500).json({
				error: err.message
			});
		}
	}
}

export default Login;
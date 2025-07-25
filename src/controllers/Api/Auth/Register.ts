/**
 * Define the Register API logic
 *
 * @author Faiz A. Farooqui <faiz@geekyants.com>
 */

import { Request, Response } from 'express';
import User from '../../../models/User';
import Log from '../../../middlewares/Log';


class Register {
	public static async perform (req: Request, res: Response): Promise<any> {
		req.assert('email', 'E-mail cannot be blank').notEmpty();
		req.assert('email', 'E-mail is not valid').isEmail();
		req.assert('password', 'Password cannot be blank').notEmpty();
		req.assert('password', 'Password length must be at least 8 characters').isLength({ min: 8 });
		req.assert('confirmPassword', 'Confirmation Password cannot be blank').notEmpty();
		req.assert('confirmPassword', 'Password & Confirmation password does not match').equals(req.body.password);
		req.sanitize('email').normalizeEmail({ gmail_remove_dots: false });

		const errors = req.validationErrors();
		if (errors) {
			return res.status(400).json({ errors });
		}

		try {
			const email = req.body.email;

			const existingUser = await User.findOne({ email });
			if (existingUser) {
				return res.status(409).json({
					error: 'Account with this e-mail address already exists.'
				});
			}

			const user = new User({
				email: email,
				password: req.body.password
			});

			await user.save();

			return res.json({
				message: 'You have been successfully registered!'
			});

		} catch (err) {
            Log.error(err.message);
			return res.status(500).json({
				error: err.message
			});
		}
	}
}

export default Register;
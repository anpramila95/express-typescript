/**
 * Handles your register route
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import User from '../../models/User';
import { IRequest, IResponse, INext } from '../../interfaces/vendors';

class Register {
	public static show (req: IRequest, res: IResponse): any {
		return res.render('pages/signup', {
			title: req.__('titles.signup')
		});
	}

	public static async perform (req: IRequest, res: IResponse, next: INext): Promise<any> {
		req.assert('email', req.__('validation.email_blank')).notEmpty();
		req.assert('email', req.__('validation.email_invalid')).isEmail();
		req.assert('password', req.__('validation.password_blank')).notEmpty();
		req.assert('password', req.__('validation.password_min_length')).isLength({ min: 8 });
		req.assert('confirmPassword', req.__('validation.confirm_password_blank')).notEmpty();
		req.assert('confirmPassword', req.__('validation.password_mismatch')).equals(req.body.password);
		req.sanitize('email').normalizeEmail({ gmail_remove_dots: false });

		const errors = req.validationErrors();
		if (errors) {
			req.flash('errors', errors);
			return res.redirect('/signup');
		}

		try {
			const existingUser = await User.findOne({ email: req.body.email });
			if (existingUser) {
				req.flash('errors', { msg: req.__('auth.account_exists') });
				return res.redirect('/signup');
			}

			console.log('Creating new user with email:', req.body.email, req.body.password);
			// Create a new user instance

			const user = new User({
				email: req.body.email,
				password: req.body.password
			});

			await user.save();

			req.logIn(user, (err) => {
				if (err) {
					return next(err);
				}
				req.flash('success', { msg: req.__('auth.register_success') });
				res.redirect('/account');
			});
		} catch (error) {
			console.log('Error during registration:', error);
			req.flash('errors', { msg: req.__('general.error_occurred') });

			return res.redirect('/signup');
		}
	}
}

export default Register;
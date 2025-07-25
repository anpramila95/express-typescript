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
			title: 'SignUp'
		});
	}

	public static async perform (req: IRequest, res: IResponse, next: INext): Promise<any> {
		req.assert('email', 'E-mail cannot be blank').notEmpty();
		req.assert('email', 'E-mail is not valid').isEmail();
		req.assert('password', 'Password cannot be blank').notEmpty();
		req.assert('password', 'Password length must be atleast 8 characters').isLength({ min: 8 });
		req.assert('confirmPassword', 'Confirmation Password cannot be blank').notEmpty();
		req.assert('confirmPassword', 'Password & Confirmation password does not match').equals(req.body.password);
		req.sanitize('email').normalizeEmail({ gmail_remove_dots: false });

		const errors = req.validationErrors();
		if (errors) {
			req.flash('errors', errors);
			return res.redirect('/signup');
		}

		try {
			const existingUser = await User.findOne({ email: req.body.email });
			if (existingUser) {
				req.flash('errors', { msg: 'Account with that e-mail address already exists.' });
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
				req.flash('success', { msg: 'You are successfully logged in!' });
				res.redirect('/account');
			});
		} catch (error) {
			console.log('Error during registration:', error);
			req.flash('errors', { msg: 'An error occurred while registering your account. Please try again later.' });

			return res.redirect('/signup');
		}
	}
}

export default Register;
/**
 * Handles your login routes
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import * as passport from 'passport';

import {
	IRequest, IResponse, INext
} from '../../interfaces/vendors';
import Log from '../../middlewares/Log';

class Login {
	public static show (req: IRequest, res: IResponse): any {
		return res.render('pages/login', {
			title: req.__('titles.login')
		});
	}

	public static perform (req: IRequest, res: IResponse, next: INext): any {
		req.assert('email', req.__('validation.email_blank')).notEmpty();
		req.assert('email', req.__('validation.email_invalid')).isEmail();
		req.assert('password', req.__('validation.password_blank')).notEmpty();
		req.assert('password', req.__('validation.password_min_length')).isLength({ min: 8 });
		req.sanitize('email').normalizeEmail({ gmail_remove_dots: false });

		const errors = req.validationErrors();
		if (errors) {
			req.flash('errors', errors);
			return res.redirect('/login');
		}

		Log.info('Here in the login controller #1!');
		passport.authenticate('local', (err, user, info) => {
			Log.info('Here in the login controller #2!');
			if (err) {
				return next(err);
			}

			if (! user) {
				req.flash('errors', info);
				return res.redirect('/login');
			}

			req.logIn(user, (err) => {
				if (err) {
					return next(err);
				}

				req.flash('success', { msg: req.__('auth.login_success') });
				res.redirect('/account');
			});
		})(req, res, next);
	}
}

export default Login;

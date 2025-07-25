/**
 * Defines the passport config
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import { Application } from 'express';
import * as passport from 'passport';

import LocalStrategy from '../services/strategies/Local';
import GoogleStrategy from '../services/strategies/Google';
import TwitterStrategy from '../services/strategies/Twitter';

import User from '../models/User';
import Log from '../middlewares/Log';

class Passport {
	public mountPackage (_express: Application): Application {
		_express = _express.use(passport.initialize());
		_express = _express.use(passport.session());

		passport.serializeUser<any, any>((user, done) => {
			done(null, user.id);
		});

		passport.deserializeUser<any, any>(async (id, done) => {
			try {
				const user = await User.findById(id);
				done(null, user);
			} catch(err) {
				done(err, null);
			}
		});

		this.mountLocalStrategies();

		return _express;
	}

	public mountLocalStrategies(): void {
		try {
			LocalStrategy.init(passport);
			GoogleStrategy.init(passport);
			TwitterStrategy.init(passport);
		} catch (_err) {
			Log.error(_err.stack);
		}
	}

	public isAuthenticated (req, res, next): any {
		if (req.isAuthenticated()) {
			return next();
		}

		req.flash('errors', { msg: 'Please Log-In to access any further!'});
		return res.redirect('/login');
	}
}

export default new Passport;
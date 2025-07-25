/**
 * Define passport's local strategy
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import { Strategy } from 'passport-local';
import User from '../../models/User';
import Log from '../../middlewares/Log';

class Local {
	public static init (_passport: any): any {
		_passport.use(new Strategy({ usernameField: 'email' }, async (email, password, done) => {
			Log.info(`Authenticating user: ${email}`);

			try {
				const user = await User.findOne({ email: email.toLowerCase() });

				if (!user) {
					return done(null, false, { msg: `E-mail ${email} not found.`});
				}

				if (!user.password) {
					return done(null, false, { msg: `E-mail ${email} was not registered with a password. Please use a social login.`});
				}

				const isMatch = await user.comparePassword(password);
				if (isMatch) {
					return done(null, user);
				}

				return done(null, false, { msg: 'Invalid E-mail or password.'});
			} catch (err) {
				return done(err);
			}
		}));
	}
}

export default Local;
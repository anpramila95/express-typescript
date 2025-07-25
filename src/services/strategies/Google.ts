/**
 * Define Google OAuth2
 *
 * @author Faiz A. Farooqui <faiz@geekyants.com>
 */

import { Strategy } from 'passport-google-oauth20';
import User from '../../models/User';
import Locals from '../../providers/Locals';

class Google {
	public static init (_passport: any): any {
		_passport.use(new Strategy({
			clientID: process.env.GOOGLE_ID,
			clientSecret: process.env.GOOGLE_SECRET,
			callbackURL: `${Locals.config().url}/auth/google/callback`,
			passReqToCallback: true
		}, async (req, accessToken, refreshToken, profile, done) => {
			try {
                const email = profile.emails[0].value;
                const googleId = profile.id;

				if (req.user) { // User is already logged in, link the account
                    const loggedInUser = req.user as User;
					const existingUser = await User.findOne({ email: `google:${googleId}` }); // Check if google account is already linked

					if (existingUser) {
						req.flash('errors', { msg: 'There is already a Google account that belongs to you.' });
						return done(null, false);
					}

                    const userToUpdate = await User.findById(loggedInUser.id);
                    if(!userToUpdate) {
                        return done(null, false, { msg: "User not found."});
                    }

					userToUpdate.google = googleId;
					userToUpdate.tokens.push({ kind: 'google', accessToken });
					userToUpdate.fullname = userToUpdate.fullname || profile.displayName;
					userToUpdate.picture = userToUpdate.picture || profile._json.picture;
					await userToUpdate.save();

					req.flash('info', { msg: 'Google account has been linked.' });
					return done(null, userToUpdate);

				} else { // User is not logged in, login or register
					let user = await User.findOne({ email: `google:${googleId}` });
					if (user) {
						return done(null, user);
					}

                    // Check if email exists
                    user = await User.findOne({ email: email });
                    if(user) {
                        req.flash('errors', { msg: 'An account with this email already exists. Please login to link your Google account.' });
                        return done(null, false);
                    }

					const newUser = new User({
                        email: email,
						google: googleId,
						tokens: [{ kind: 'google', accessToken }],
						fullname: profile.displayName,
						picture: profile._json.picture
					});

					await newUser.save();
					return done(null, newUser);
				}
			} catch (err) {
				return done(err);
			}
		}));
	}
}

export default Google;
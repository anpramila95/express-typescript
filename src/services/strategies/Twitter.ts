/**
 * Define Twitter OAuth2
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import { Strategy } from 'passport-twitter';
import User from '../../models/User';
import Locals from '../../providers/Locals';

class Twitter {
	public static init (_passport: any): any {
		_passport.use(new Strategy({
			consumerKey: process.env.TWITTER_KEY,
			consumerSecret: process.env.TWITTER_SECRET,
			callbackURL: `${Locals.config().url}/auth/twitter/callback`,
			passReqToCallback: true
		}, async (req, accessToken, tokenSecret, profile, done) => {
            try {
                const twitterId = profile.id;

                if (req.user) { // User is logged in, link accounts
                    const loggedInUser = req.user as User;
                    const existingUser = await User.findOne({ email: `twitter:${twitterId}`});

                    if (existingUser) {
						req.flash('errors', { msg: 'There is already a Twitter account that belongs to you.' });
						return done(null, false);
					}

                    const userToUpdate = await User.findById(loggedInUser.id);
                     if(!userToUpdate) {
                        return done(null, false, { msg: "User not found."});
                    }

                    userToUpdate.twitter = twitterId;
                    userToUpdate.tokens.push({ kind: 'twitter', accessToken, tokenSecret });
                    userToUpdate.fullname = userToUpdate.fullname || profile.displayName;
                    userToUpdate.picture = userToUpdate.picture || profile._json.profile_image_url_https;
                    await userToUpdate.save();

                    req.flash('info', { msg: 'Twitter account has been linked.' });
					return done(null, userToUpdate);

                } else { // User is not logged in, login or register
                    let user = await User.findOne({ email: `twitter:${twitterId}` });
                    if(user) {
                        return done(null, user);
                    }

                    // Twitter does not provide an email, so we create a fake one
                    const newUser = new User({
                        email: `${profile.username}@twitter.com`,
                        twitter: twitterId,
                        tokens: [{ kind: 'twitter', accessToken, tokenSecret }],
                        fullname: profile.displayName,
                        picture: profile._json.profile_image_url_https
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

export default Twitter;
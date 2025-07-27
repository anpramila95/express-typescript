/**
 * Define the Register API logic
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import { Request, Response } from 'express';
import User from '../../../models/User';
import Log from '../../../middlewares/Log';
import Site, {ISite} from '../../../models/Site';

/** event */
import Event from '../../../providers/Event';
import { events } from '../../../events/definitions';

class Register {
	public static async perform (req: Request, res: Response): Promise<any> {
		req.assert('email', 'E-mail cannot be blank').notEmpty();
		req.assert('email', 'E-mail is not valid').isEmail();
		req.assert('password', 'Password cannot be blank').notEmpty();
		req.assert('password', 'Password length must be at least 8 characters').isLength({ min: 8 });
		req.assert('confirmPassword', 'Confirmation Password cannot be blank').notEmpty();
		req.assert('confirmPassword', 'Password & Confirmation password does not match').equals(req.body.password);
		req.sanitize('email').normalizeEmail({ gmail_remove_dots: true });

		const site = (req as any).site as ISite;
		try {
			const email = req.body.email;

			const existingUser = await User.findOne({ email, site_id: site.id });
			if (existingUser) {
				return res.status(409).json({
					error: 'Account with this e-mail address already exists.'
				});
			}

			let affiliate_id = req.body.affiliate_id || null;

			//check affiliate_id
			if (affiliate_id) {
				const affiliate = await User.findById(affiliate_id, site.id);
				if (!affiliate) {
					affiliate_id = null;
				}
			}

			const user = new User({
				email: email,
				password: req.body.password,
				site_id: site.id,
				affiliate_id: affiliate_id,
			});

			await user.save();

			Event.emit(events.user.created, { user }); //su kien

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
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
		req.assert('email', req.__('validation.email_blank')).notEmpty();
		req.assert('email', req.__('validation.email_invalid')).isEmail();
		req.assert('password', req.__('validation.password_blank')).notEmpty();
		req.assert('password', req.__('validation.password_min_length')).isLength({ min: 8 });
		req.assert('confirmPassword', req.__('validation.confirm_password_blank')).notEmpty();
		req.assert('confirmPassword', req.__('validation.password_mismatch')).equals(req.body.password);
		req.sanitize('email').normalizeEmail({ gmail_remove_dots: true });

		const site = (req as any).site as ISite;
		try {
			const email = req.body.email;

			const existingUser = await User.findOne({ email, site_id: site.id });
			if (existingUser) {
				return res.status(409).json({
					error: req.__('auth.account_exists')
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
				message: req.__('auth.register_success')
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
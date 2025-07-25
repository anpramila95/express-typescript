/**
 * Handle all your social auth routesß
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

class Social {
	public static googleCallback(req, res): any {
		return res.redirect('/account');
	}
}

export default Social;

/**
 * Defines all the requisites in HTTP
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import { Application } from 'express';
import * as bodyParser from 'body-parser';
import * as compress from 'compression';
import * as cors from 'cors';
import * as session from 'express-session';
import * as expressValidator from 'express-validator';
import * as flash from 'express-flash';
import * as MySQLStore from 'express-mysql-session';

import Locals from '../providers/Locals';
import Passport from '../providers/Passport';
import Database from '../providers/Database';
import Log from './Log';

const MySQLStoreSession = MySQLStore(session);

class Http {
	public static mount(_express: Application): Application {
		Log.info('Booting the \'HTTP\' middleware...');

		// Enables the request body parser
		_express.use(bodyParser.json({
			limit: Locals.config().maxUploadLimit
		}));
		_express.use(bodyParser.urlencoded({
			limit: Locals.config().maxUploadLimit,
			parameterLimit: Locals.config().maxParameterLimit,
			extended: false
		}));

		// Disable the x-powered-by header in response
		_express.disable('x-powered-by');

		// Enables the request payload validator
		_express.use(expressValidator());

		// Enables the request flash messages
		_express.use(flash());

        // Session store options
        const sessionStoreOptions = {
            host: Locals.config().mysqlConfig.host,
            port: Locals.config().mysqlConfig.port,
            user: Locals.config().mysqlConfig.user,
            password: Locals.config().mysqlConfig.password,
            database: Locals.config().mysqlConfig.database,
            clearExpired: true,
            checkExpirationInterval: 900000, // 15 minutes
        };

        const sessionStore = new MySQLStoreSession(sessionStoreOptions, Database.pool);

		const options = {
			resave: true,
			saveUninitialized: true,
			secret: Locals.config().appSecret,
			cookie: {
				maxAge: 1209600000 // two weeks (in ms)
			},
			store: sessionStore
		};

		_express.use(session(options));

		// Enables the CORS
		_express.use(cors());

		// Enables the "gzip" / "deflate" compression for response
		_express.use(compress());

		// Loads the passport configuration
		_express = Passport.mountPackage(_express);

		return _express;
	}
}

export default Http;
/**
 * Primary file for your Clustered API Server
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import * as express from 'express';

// Use this specific import syntax to ensure compatibility
import responseTime = require('response-time');
import * as i18n from 'i18n';


import Locals from './Locals';
import Routes from './Routes';
import Bootstrap from '../middlewares/Kernel';
import ExceptionHandler from '../exception/Handler';
import { resolveTenant } from '../middlewares/TenantResolver'; // << IMPORT MIDDLEWARE MỚI

import I18n from './I18n'; // Thêm dòng này

class Express {
    /**
     * Create the express object
     */
    public express: express.Application;

    /**
     * Initializes the express server
     */
    constructor () {
        this.express = express();
        
        this.mountDotEnv();
        this.mountTenantResolver(); // << GỌI ĐẦU TIÊN
        this.mountI18n(); // Thêm dòng này
        this.mountMiddlewares();
        this.mountRoutes();
        
    }

    private mountDotEnv (): void {
        this.express = Locals.init(this.express);
    }

     private mountTenantResolver (): void {
        this.express.use(resolveTenant);
    }


     private mountI18n(): void { // Thêm hàm này
        I18n.init();
        this.express.use(i18n.init);
    }

    /**
     * Mounts all the defined middlewares
     */
    private mountMiddlewares (): void {
        // Gắn middleware đo thời gian ngay từ đầu
        this.express.use(responseTime()); // <-- 2. Chỉ cần gọi hàm này ở đây

        // Tiếp tục với các middleware hiện có của bạn
        this.express = Bootstrap.init(this.express);
    }

    /**
     * Mounts all the defined routes
     */
    private mountRoutes (): void {
        this.express = Routes.mountWeb(this.express);
        this.express = Routes.mountApi(this.express);
    }

    /**
     * Starts the express server
     */
    public init (): any {
        const port: number = Locals.config().port;

        // Registering Exception / Error Handlers
        this.express.use(ExceptionHandler.logErrors);
        this.express.use(ExceptionHandler.clientErrorHandler);
        this.express.use(ExceptionHandler.errorHandler);
        this.express = ExceptionHandler.notFoundHandler(this.express);

        // Start the server on the specified port
        this.express.listen(port, () => {
            return console.log('\x1b[33m%s\x1b[0m', `Server :: Running @ 'http://localhost:${port}'`);
        }).on('error', (_error) => {
            return console.log('Error: ', _error.message);
        });
    }
}

/** Export the express module */
export default new Express();
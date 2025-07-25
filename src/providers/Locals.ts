/**
 * Define App Locals & Configs
 *
 * @author SinhThanh <sinhthanh.dev@gmail.com>
 */

import { Application } from "express";
import * as path from "path";
import * as dotenv from "dotenv";

class Locals {
  /**
   * Makes env configs available for your app
   * throughout the app's runtime
   */
  public static config(): any {
    dotenv.config({ path: path.join(__dirname, "../../.env") });

    const url = process.env.APP_URL || `http://localhost:${process.env.PORT}`;
    const port = process.env.PORT || 4040;
    const appSecret = process.env.APP_SECRET || "This is your responsibility!";
    const maxUploadLimit = process.env.APP_MAX_UPLOAD_LIMIT || "50mb";
    const maxParameterLimit = process.env.APP_MAX_PARAMETER_LIMIT || "50mb";

    const name = process.env.APP_NAME || "NodeTS Dashboard";
    const keywords = process.env.APP_KEYWORDS || "somethings";
    const year = new Date().getFullYear();
    const copyright = `Copyright ${year} ${name} | All Rights Reserved`;
    const company = process.env.COMPANY_NAME || "GeekyAnts";
    const description =
      process.env.APP_DESCRIPTION || "Here goes the app description";

    const isCORSEnabled = process.env.CORS_ENABLED || true;
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || 3;
    const apiPrefix = process.env.API_PREFIX || "api";

    const logDays = process.env.LOG_DAYS || 10;

    const queueMonitor = process.env.QUEUE_HTTP_ENABLED || true;
    const queueMonitorHttpPort = process.env.QUEUE_HTTP_PORT || 5550;

    const redisHttpPort = process.env.REDIS_QUEUE_PORT || 6379;
    const redisHttpHost = process.env.REDIS_QUEUE_HOST || "127.0.0.1";
    const redisPrefix = process.env.REDIS_QUEUE_DB || "q";
    const redisDB = process.env.REDIS_QUEUE_PREFIX || 3;

    const mysqlConfig = {
      host: process.env.MYSQL_HOST || "123.30.240.93",
      user: process.env.MYSQL_USER || "sinhthanh",
      password: process.env.MYSQL_PASSWORD || "N9ar]XJjNpVXXcIH",
      database: process.env.MYSQL_DATABASE || "apis",
      port: process.env.MYSQL_PORT || 3306,
    };

    // ... trong hàm config()
    const creditCosts = {
      image: process.env.CREDIT_COST_IMAGE || 1,
      video: process.env.CREDIT_COST_VIDEO || 5,
      tts: process.env.CREDIT_COST_TTS || 1,
      imageToVideo: process.env.CREDIT_COST_IMAGE_TO_VIDEO || 3,
    };
    return {
      appSecret,
      apiPrefix,
      company,
      copyright,
      description,
      isCORSEnabled,
      jwtExpiresIn,
      keywords,
      logDays,
      maxUploadLimit,
      maxParameterLimit,
      name,
      port,
      redisDB,
      redisHttpPort,
      redisHttpHost,
      redisPrefix,
      url,
      queueMonitor,
      queueMonitorHttpPort,
      mysqlConfig,
      creditCosts,
    };
  }

  /**
   * Injects your config to the app's locals
   */
  public static init(_express: Application): Application {
    _express.locals.app = this.config();
    return _express;
  }
}

export default Locals;

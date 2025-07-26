import * as nodemailer from 'nodemailer';
import SES = require('aws-sdk/clients/ses'); // Thay đổi ở đây
import Locals from '../providers/Locals';
import Log from '../middlewares/Log';

class MailService {
    private transporter;

    constructor() {
        const sesConfig = {
            accessKeyId: Locals.config().sesConfig.awsSesAccessKeyId,
            secretAccessKey: Locals.config().sesConfig.awsSesSecretAccessKey,
            region: Locals.config().sesConfig.awsSesRegion
        };

        this.transporter = nodemailer.createTransport({
            SES: new SES(sesConfig) // Sử dụng SES đã import
        });
    }

    public async sendMail(to: string, subject: string, html: string): Promise<void> {
        //tạm thời return null
        return null;
        const mailOptions = {
            from: Locals.config().sesConfig.mailFrom,
            to,
            subject,
            html
        };

        try {
            await this.transporter.sendMail(mailOptions);
            Log.info(`Email sent to ${to}`);
        } catch (error) {
            Log.error(`Error sending email: ${error.stack}`);
        }
    }
}

export default new MailService();
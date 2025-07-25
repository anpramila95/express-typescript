// src/providers/I18n.ts

import * as i18n from 'i18n';
import * as path from 'path';

class I18n {
    public static init(): void {
        i18n.configure({
            locales: ['en', 'vi'],
            directory: path.join(__dirname, '../locales'),
            defaultLocale: 'en',
            autoReload: true,
            syncFiles: true,
            objectNotation: true,
            cookie: 'locale',
        });
    }
}

export default I18n;
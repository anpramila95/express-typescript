import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

class Utils {
    /**
     * Sleep for a specified number of milliseconds
     * @param ms - Number of milliseconds to sleep
     * @returns Promise that resolves after the specified time
     */
    public static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Download and save a file from URL to local path
     * @param url - The URL to download from
     * @param outputPath - The local path to save the file
     * @returns Promise that resolves when file is saved
     */
    public static saveFileFromUrl(url: string, outputPath: string): Promise<void | boolean> {
        return new Promise((resolve, reject) => {
            // Ensure directory exists
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Create write stream
            const file = fs.createWriteStream(outputPath);

            // Choose http or https based on URL
            const httpModule = url.startsWith('https:') ? https : http;

            const request = httpModule.get(url, (response) => {
                // Check if response is successful
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
                    return;
                }

                // Pipe response to file
                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });

                file.on('error', (err) => {
                    fs.unlink(outputPath, () => {}); // Delete partial file on error
                    reject(err);
                });
            });

            request.on('error', (err) => {
                fs.unlink(outputPath, () => {}); // Delete partial file on error
                reject(err);
            });

            request.setTimeout(30000, () => {
                request.destroy();
                fs.unlink(outputPath, () => {}); // Delete partial file on timeout
                reject(new Error('Request timeout'));
            });
        });
    }
}

export default Utils;
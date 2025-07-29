import OpenAI from "openai";
import axios, { AxiosError, AxiosRequestConfig } from "axios";
import * as FormData from "form-data";

import * as fs from "fs";
import Plimit from "p-limit";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory, GenerationConfig } from "@google/generative-ai";

// Import các module/service khác trong dự án của bạn
import Log from "../middlewares/Log";
import Utils from "./utils/Utils";
import DigenService from "./DigenService";
// --- Khởi tạo các client API chính ---

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const deepseek = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
});

const grok = new OpenAI({
    baseURL: "https://api.x.ai/v1",
    apiKey: process.env.GROK_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const limit = Plimit(5); // Giới hạn 5 request đồng thời

// --- Định nghĩa các Models và Interfaces ---

const MODEL_LISTS = {
    chatgpt: ["gpt-4o-mini", "gpt-3.5-turbo", "gpt-4o", "dall-e-3"] as const,
    tts: ["echo", "fable", "alloy", "nova", "shimmer", "onyx"] as const,
    deepseek: ["deepseek-reasoner", "deepseek-chat"] as const,
    grok: ["grok-2-latest", "grok-3-fast-latest", "grok-3-mini-fast-latest"] as const,
    google: ["gemini-1.5-pro-latest", "gemini-1.5-flash-latest", "gemini-1.0-pro", "imagen-3.0-generate-002"] as const,
    stability: ["stable-diffusion-xl-1024-v1-0", "stable-image-ultra"] as const,
} as const;

// --- Type Definitions ---
type ChatGptModel = typeof MODEL_LISTS.chatgpt[number];
type TtsModel = typeof MODEL_LISTS.tts[number];
type DeepseekModel = typeof MODEL_LISTS.deepseek[number];
type GrokModel = typeof MODEL_LISTS.grok[number];
type GoogleModel = typeof MODEL_LISTS.google[number];
type StabilityModel = typeof MODEL_LISTS.stability[number];
type AnyAiModel = ChatGptModel | TtsModel | DeepseekModel | GrokModel | GoogleModel | StabilityModel;

interface BaseAiArgs {
    response_format?: { type: 'json_object' } | null;
    [key: string]: any;
}

interface ImageArgs extends BaseAiArgs {
    seed?: number | null;
    subCategory?: string | null;
    mainCategory?: string | null;
    ref?: string | null;
    guidance?: number;
    step?: number;
}

interface DigenJobArgs {
    thumbnail: string;
    prompt?: string;
    model?: string;
    ratio?: '16:9' | '9:16';
    lipsync?: number;
    seconds?: number;
    audio_url?: string;
}

// --- Helper Functions ---
const getProviderFromModel = (model: AnyAiModel): keyof typeof MODEL_LISTS | null => {
    return (Object.keys(MODEL_LISTS) as Array<keyof typeof MODEL_LISTS>).find(key =>
        (MODEL_LISTS[key] as readonly string[]).includes(model)
    );
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// =========================================================================
// TEXT GENERATION SERVICE
// =========================================================================
class TextService {
    public static async generate(prompt: string, model: AnyAiModel = "gpt-4o-mini", maxTokens: number = 2048, args: BaseAiArgs = {}, run: number = 0): Promise<string | null> {
        if (run > 2) {
            Log.error("❌ Đã thử quá 3 lần, không thể tạo nội dung text.");
            return null;
        }

        const provider = getProviderFromModel(model);
        Log.info(`Requesting text from ${provider} with model ${model}`);

        try {
            switch (provider) {
                case 'chatgpt':
                    return await this.chatgpt(prompt, model as ChatGptModel, maxTokens, args);
                case 'deepseek':
                    return await this.deepseek(prompt, model as DeepseekModel, maxTokens);
                case 'grok':
                    return await this.grok(prompt, model as GrokModel, maxTokens);
                case 'google':
                    return await this.google(prompt, model as GoogleModel, args);
                default:
                    Log.error(`Provider không xác định cho model: ${model}. Sử dụng fallback là gpt-4o-mini.`);
                    return await this.chatgpt(prompt, "gpt-4o-mini", maxTokens, args);
            }
        } catch (error) {
            Log.error(`Lỗi khi tạo text từ model ${model}: ${(error as Error).message}. Thử lại...`);
            await Utils.sleep(1000); // Đợi 1s trước khi thử lại
            return this.generate(prompt, "gpt-4o-mini", maxTokens, args, run + 1);
        }
    }

    private static async chatgpt(prompt: string, model: ChatGptModel, maxTokens: number, args: BaseAiArgs): Promise<string | null> {
        const response = await openai.chat.completions.create({
            model: model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens,
            response_format: args.response_format,
        });
        return response.choices[0].message.content;
    }

    private static async deepseek(prompt: string, model: DeepseekModel, maxTokens: number): Promise<string | null> {
        const response = await deepseek.chat.completions.create({
            model: model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens
        });
        return response.choices[0].message.content;
    }

    private static async grok(prompt: string, model: GrokModel, maxTokens: number): Promise<string | null> {
        const response = await grok.chat.completions.create({
            model: model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens
        });
        return response.choices[0].message.content;
    }

    private static async google(prompt: string, model: GoogleModel, args: BaseAiArgs): Promise<string | null> {
        const generationConfig: GenerationConfig = {
            temperature: 1,
            topP: 0.95,
            topK: 64,
            maxOutputTokens: 8192,
            responseMimeType: args.response_format?.type === 'json_object' ? 'application/json' : 'text/plain',
        };
        const geminiModel = genAI.getGenerativeModel({ model, safetySettings, generationConfig });
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    }
}

// =========================================================================
// IMAGE GENERATION SERVICE
// =========================================================================
class ImageService {
    public static async generate(prompt: string, model: AnyAiModel, outputFile: string, ratio: string = "16:9", args: ImageArgs = {}): Promise<string | null> {
        const provider = getProviderFromModel(model);
        Log.info(`Requesting image from ${provider} with model ${model}`);
        try {
            switch (provider) {
                case 'chatgpt': // DALL-E
                    return await this.dalle(prompt, model as ChatGptModel, outputFile, ratio, args);
                case 'stability':
                    return await this.stability(prompt, model as StabilityModel, outputFile, ratio, args);
                case 'google':
                    return await this.google(prompt, model as GoogleModel, outputFile, ratio, args);
                default:
                    Log.error(`Model tạo ảnh không hợp lệ: ${model}`);
                    return null;
            }
        } catch (error) {
            Log.error(`Lỗi khi tạo ảnh từ model ${model}: ${(error as Error).message}`);
            return null;
        }
    }

    private static async dalle(prompt: string, model: ChatGptModel, outputFile: string, ratio: string, args: ImageArgs): Promise<string | null> {
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: ratio === "16:9" ? "1792x1024" : "1024x1792",
            response_format: "url",
        });
        const imageUrl = response.data[0].url;
        if (imageUrl) {
            const saved = await Utils.saveFileFromUrl(imageUrl, outputFile);
            if (saved) {
                return outputFile;
            }
        }
        return null;
    }

    private static async stability(prompt: string, model: StabilityModel, outputFile: string, ratio: string, args: ImageArgs): Promise<string | null> {
        const engineId = 'stable-image-ultra'; // Hoặc các engine khác
        const apiHost = 'https://api.stability.ai';
        const apiKey = process.env.STABILITY_API_KEY;

        const formData = new FormData();
        formData.append('prompt', prompt);
        formData.append('aspect_ratio', ratio);
        formData.append('output_format', 'webp');
        if (args.ref && fs.existsSync(args.ref)) {
            formData.append('image', fs.createReadStream(args.ref));
        }

        const response = await axios.post(`${apiHost}/v2beta/stable-image/generate/ultra`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Accept': 'image/*',
                'Authorization': `Bearer ${apiKey}`,
            },
            responseType: 'arraybuffer',
        });

        fs.writeFileSync(outputFile, response.data);
        return outputFile;
    }

    private static async google(prompt: string, model: GoogleModel, outputFile: string, ratio: string, args: ImageArgs): Promise<string | null> {
        const geminiModel = genAI.getGenerativeModel({ model: "imagen-3.0-generate-002" as any }); // Cast 'any' as SDK might not be updated
        const result = await geminiModel.generateContent(prompt);
        // Note: Google's image gen API might differ. This is a placeholder.
        // You'll likely get a response with image data or a URL.
        Log.warn("Google Image Generation (Imagen) logic needs to be implemented based on the actual API response structure.");
        return null;
    }
}

// =========================================================================
// VOICE (TTS) GENERATION SERVICE
// =========================================================================
class VoiceService {
    public static async generate(text: string, model: AnyAiModel, outputFile: string, args: BaseAiArgs = {}): Promise<string | null> {
        const provider = getProviderFromModel(model);
        Log.info(`Requesting TTS from ${provider} with model ${model}`);
        try {
            switch (provider) {
                case 'tts': // OpenAI TTS
                    return await this.openai(text, model as TtsModel, outputFile);
                case 'google':
                    return await this.google(text, outputFile);
                default:
                    Log.error(`Model TTS không hợp lệ: ${model}`);
                    return null;
            }
        } catch (error) {
            Log.error(`Lỗi khi tạo âm thanh từ model ${model}: ${(error as Error).message}`);
            return null;
        }
    }

    private static async openai(text: string, model: TtsModel, outputFile: string): Promise<string | null> {
        const speechFile = outputFile;
        const response = await openai.audio.speech.create({
            model: "tts-1", // "tts-1-hd" for higher quality
            voice: model,
            input: text,
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(speechFile, buffer);
        return speechFile;
    }

    private static async google(text: string, outputFile: string): Promise<string | null> {
        Log.warn("Google TTS logic needs to be implemented using their specific Text-to-Speech API client, not Gemini.");
        // Placeholder: This would involve using the @google-cloud/text-to-speech client
        return null;
    }
}

// =========================================================================
// VIDEO GENERATION SERVICE
// =========================================================================
class VideoService {
    public static async digen(args: DigenJobArgs): Promise<any> {
        // This now properly delegates to the dedicated DigenService
        return DigenService.createJob(args);
    }
}


// =========================================================================
// GRAMMAR FIXING SERVICE
// =========================================================================
class FixGrammarService {
    public static async fix(text: string): Promise<string | null> {
        const prompt = `Correct this to standard English:\n\n${text}`;
        return TextService.generate(prompt, "gpt-4o-mini");
    }
}


// =========================================================================
// TRANSLATION SERVICE
// =========================================================================
class TranslationService {
    public static async translate(text: string, targetLang: string = "vi"): Promise<string | null> {
        const prompt = `Translate the following text to ${targetLang}:\n\n${text}`;
        return TextService.generate(prompt, "gemini-1.5-flash-latest");
    }
}

// =========================================================================
// TRANSCRIPTION SERVICE (Speech-to-Text)
// =========================================================================
class TranscriptService {
    public static async transcript(filePath: string): Promise<string | null> {
        if (!fs.existsSync(filePath)) {
            Log.error(`File không tồn tại: ${filePath}`);
            return null;
        }
        try {
            const response = await openai.audio.transcriptions.create({
                file: fs.createReadStream(filePath),
                model: "whisper-1",
            });
            return response.text;
        } catch (error) {
            Log.error(`Lỗi khi chuyển giọng nói thành văn bản: ${(error as Error).message}`);
            return null;
        }
    }
}

// =========================================================================
// EXPORT ALL SERVICES
// =========================================================================
const Ai = {
    Text: TextService,
    Image: ImageService,
    Voice: VoiceService,
    Video: VideoService,
    FixGrammar: FixGrammarService,
    Translate: TranslationService,
    Transcript: TranscriptService
};

export default Ai;
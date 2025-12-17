// Minimal type for OpenAI image generation params for local use
export type OpenAIImageSize = "1024x1024" | "auto" | "1536x1024" | "1024x1536" | "256x256" | "512x512" | "1792x1024" | "1024x1792" | null | undefined;

export interface OpenAIImageGenerateParams {
    model: string;
    prompt: string;
    n: number;
    size: OpenAIImageSize;
    response_format?: "url" | "b64_json";
    /**
     * Quality for GPT image models: 'high' | 'medium' | 'low'. Defaults to 'auto' on the API side.
     */
    quality?: "high" | "medium" | "low";
    /**
     * Output format for GPT image models (png, jpeg, webp). Only applies to GPT image models.
     */
    output_format?: "png" | "jpeg" | "webp";
}

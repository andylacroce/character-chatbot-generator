// src/utils/openaiModelSelector.ts

/**
 * Returns the appropriate OpenAI model(s) for text or image based on environment.
 * @param {"text"|"image"} type - The type of model ("text" or "image").
 * @returns {string|{primary: string, fallback: string}} The model name to use, or an object for images.
 */
export function getOpenAIModel(type: "text"): string;
export function getOpenAIModel(type: "image"): { primary: string; fallback: string };
export function getOpenAIModel(type: "text" | "image"): string | { primary: string; fallback: string } {
    const env = process.env.NODE_ENV;
    const vercelEnv = process.env.VERCEL_ENV;
    const isProd = env === "production" || vercelEnv === "production";
    if (type === "text") {
        // Use gpt-4o-mini everywhere - it's faster, much cheaper per token, and has 128K context
        // Perfect for short conversational responses and character roleplay
        return "gpt-4o-mini";
    }
    if (type === "image") {
        // Use gpt-image-1/dall-e-3 in prod, dall-e-2/dall-e-3 in dev (cheaper first)
        if (isProd) {
            return { primary: "gpt-image-1", fallback: "dall-e-3" };
        } else {
            return { primary: "dall-e-2", fallback: "dall-e-3" };
        }
    }
    throw new Error(`Unknown OpenAI model type: ${type}`);
}

// src/utils/openaiModelSelector.ts

/**
 * Returns the appropriate OpenAI model(s) for text or image based on environment.
 * @param {"text"|"image"} type - The type of model ("text" or "image").
 * @returns {string|{primary: string, fallback: string}} The model name to use, or an object for images.
 */
export function getOpenAIModel(type: "text"): string;
export function getOpenAIModel(type: "image"): { primary: string; fallback: string };
export function getOpenAIModel(type: "text" | "image"): string | { primary: string; fallback: string } {
    const env = process.env.NODE_ENV || "development";
    if (type === "text") {
        return env === "production" ? "gpt-4o" : "gpt-3.5-turbo";
    }
    if (type === "image") {
        if (env === "production") {
            return { primary: "gpt-image-1", fallback: "dall-e-3" };
        } else {
            return { primary: "dall-e-2", fallback: "dall-e-2" };
        }
    }
    throw new Error(`Unknown OpenAI model type: ${type}`);
}

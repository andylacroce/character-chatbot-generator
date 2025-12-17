/**
 * Model selection utility for OpenAI API calls.
 * Uses gpt-4o in production for best quality and gpt-4o-mini in development for cost efficiency.
 */

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
        // Production: gpt-4o for best quality and fluency
        // Development: gpt-4o-mini for cost-effective testing
        return isProd ? "gpt-4o" : "gpt-4o-mini";
    }
    if (type === "image") {
        // Production: prefer the new gpt-image-1.5 for best quality
        // Development: dall-e-2 for cost savings
        if (isProd) {
            return { primary: "gpt-image-1.5", fallback: "dall-e-3" };
        } else {
            return { primary: "dall-e-2", fallback: "dall-e-3" };
        }
    }
    throw new Error(`Unknown OpenAI model type: ${type}`);
}

/**
 * Last-resort free fallback image generation via Pollinations.ai — free, anonymous,
 * no API key or account required. Used by pages/api/generate-avatar.ts when
 * Cloudflare Workers AI isn't configured or fails, including exhausting its free
 * daily neuron allocation: unlike Cloudflare's tier, Pollinations has no comparable
 * cap, so this keeps avatar generation entirely free with no payment method ever
 * required. See CLAUDE.md's "Avatar generation" section.
 */

import { logEvent, sanitizeLogMeta } from "./logger";

/**
 * Calls Pollinations.ai to generate an image from a prompt. Returns a base64 data
 * URL, or null on any failure — same degrade-gracefully shape as the Cloudflare
 * path, so a failing free fallback never throws past this function. Note: the
 * anonymous free tier may render a small "pollinations.ai" watermark into the
 * image; there's no account-free way to suppress it.
 */
export async function generateImageWithPollinations(prompt: string): Promise<string | null> {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&model=flux`;

  logEvent(
    "info",
    "avatar_pollinations_call",
    "Calling Pollinations.ai image generation",
    sanitizeLogMeta({ prompt: prompt.slice(0, 100) }),
  );

  const response = await fetch(url);
  if (!response.ok) {
    logEvent(
      "warn",
      "avatar_pollinations_http_error",
      "Pollinations.ai request failed",
      sanitizeLogMeta({ status: response.status }),
    );
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength) {
    logEvent("warn", "avatar_pollinations_empty", "Pollinations.ai returned an empty image");
    return null;
  }

  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:image/png;base64,${base64}`;
}

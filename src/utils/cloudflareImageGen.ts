/**
 * Free-tier fallback image generation via Cloudflare Workers AI (Flux Schnell),
 * used by pages/api/generate-avatar.ts when Gemini/Vertex isn't configured or
 * fails to produce an image. See CLAUDE.md's "Avatar generation" section.
 */

import { logEvent, sanitizeLogMeta } from "./logger";

const MODEL = "@cf/black-forest-labs/flux-1-schnell";

/**
 * Calls Cloudflare Workers AI to generate an image from a prompt. Returns a base64
 * data URL, or null when CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN aren't configured
 * or the request fails — same degrade-gracefully shape as the Gemini path, so a
 * missing/failing free fallback never throws past this function.
 */
export async function generateImageWithCloudflare(prompt: string): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    logEvent(
      "info",
      "avatar_cloudflare_not_configured",
      "Cloudflare not configured (CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN unset), trying Pollinations fallback",
    );
    return null;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;

  logEvent(
    "info",
    "avatar_cloudflare_call",
    "Calling Cloudflare Workers AI image generation",
    sanitizeLogMeta({ model: MODEL, prompt: prompt.slice(0, 100) }),
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    // 8 steps is Flux Schnell's max — it's a distilled few-step model, more steps don't
    // improve quality but do cost more Workers AI neurons.
    body: JSON.stringify({ prompt, steps: 8 }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logEvent(
      "warn",
      "avatar_cloudflare_http_error",
      "Cloudflare Workers AI request failed",
      sanitizeLogMeta({ status: response.status, body: text.slice(0, 300) }),
    );
    return null;
  }

  const json = await response.json();
  const b64 = json?.result?.image;
  if (!json?.success || !b64) {
    logEvent(
      "warn",
      "avatar_cloudflare_no_image",
      "Cloudflare Workers AI returned no image",
      sanitizeLogMeta({ errors: json?.errors }),
    );
    return null;
  }

  return `data:image/png;base64,${b64}`;
}

/**
 * Shared rate-limiter factory for Next.js API routes.
 * All routes use the same IP extraction logic so limits are applied consistently
 * across proxies and load balancers.
 *
 * IMPORTANT — these limits are per-instance, not global. `express-rate-limit`
 * defaults to an in-process MemoryStore, and on Vercel every warm serverless
 * instance keeps its own counter. The effective ceiling is therefore
 * `max * (number of concurrent instances)`, and it resets whenever an instance is
 * recycled. Treat the numbers below as protection against a single hot client, not
 * as a spend cap on the paid upstream calls (Claude, Gemini image generation, TTS).
 * Making them global requires a shared store (Vercel KV / Upstash Redis via
 * `rate-limit-redis`), which this project does not provision today. `proxy.ts` is
 * what actually keeps unauthenticated callers off these routes.
 */

import rateLimit from "express-rate-limit";
import type { NextApiRequest } from "next";

/**
 * Extracts the real client IP from a request, handling proxy headers.
 */
export function getClientIp(req: NextApiRequest): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string) ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/**
 * Creates a rate limiter middleware for a Next.js API route.
 *
 * See the module note above: the limit applies per serverless instance.
 *
 * @param max - Maximum number of requests per window per IP, per instance.
 * @param message - Error message returned when the limit is exceeded.
 * @param windowMs - Window duration in milliseconds (default: 1 minute).
 */
export function createRateLimiter(
  max: number,
  message: string,
  windowMs = 60 * 1000,
) {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientIp,
  });
}

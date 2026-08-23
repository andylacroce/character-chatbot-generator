/**
 * Shared rate-limiter factory for Next.js API routes.
 * All routes use the same IP extraction logic so limits are applied consistently
 * across proxies and load balancers.
 *
 * Where the counters live depends on the environment, and that decides whether a
 * limit is global or per-instance:
 *
 * - **Local development (default).** No store is configured, so `express-rate-limit`
 *   uses its in-process MemoryStore. One dev server means one counter, which is
 *   what you want when testing off Vercel — no Redis to run, and `npm run dev`
 *   behaves the same as it always has.
 * - **Vercel with Redis attached.** Setting `KV_REST_API_URL`/`KV_REST_API_TOKEN`
 *   (or the `UPSTASH_REDIS_REST_*` pair) switches every limiter to the shared
 *   store in `rateLimitStore.ts`, so a limit of N per minute is N across all warm
 *   serverless instances rather than N per instance.
 * - **Vercel without Redis.** Falls back to MemoryStore, i.e. the effective ceiling
 *   is `max * (concurrent instances)`. That still throttles a single hot client,
 *   but treat it as protection rather than a spend cap on the paid upstream calls
 *   (Claude, Gemini image generation, TTS). `proxy.ts` is what keeps
 *   unauthenticated callers off these routes.
 *
 * A store outage lets requests through (`passOnStoreError`) rather than failing
 * them: the limiter is a throttle, not the authentication boundary.
 */

import rateLimit from "express-rate-limit";
import type { NextApiRequest } from "next";
import { createRateLimitStore, rateLimitLogger } from "./rateLimitStore";

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

/** Configuration for a single route's rate limiter. */
export interface RateLimiterOptions {
  /**
   * Short identifier for the route, e.g. "chat".
   *
   * Required because a shared store is shared across routes: without a per-limiter
   * namespace, /api/chat and /api/audio would draw down the same counter for the
   * same client and enforce whichever limit was hit first.
   */
  name: string;
  /** Maximum number of requests per window per IP. */
  max: number;
  /** Error message returned when the limit is exceeded. */
  message: string;
  /** Window duration in milliseconds (default: 1 minute). */
  windowMs?: number;
}

/**
 * Creates a rate limiter middleware for a Next.js API route.
 */
export function createRateLimiter({
  name,
  max,
  message,
  windowMs = 60 * 1000,
}: RateLimiterOptions) {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getClientIp,
    store: createRateLimitStore(name),
    passOnStoreError: true,
    logger: rateLimitLogger,
  });
}

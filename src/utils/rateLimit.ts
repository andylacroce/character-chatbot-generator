/**
 * Shared rate-limiter factory for Next.js API routes.
 * All routes use the same IP extraction logic so limits are applied consistently
 * across proxies and load balancers.
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
 * @param max - Maximum number of requests per window per IP.
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

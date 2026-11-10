/**
 * Wraps an App Router route handler (Web `Request`/`Response`) with the two things every API
 * route here needs: a per-IP rate limit and one structured `http_request_completed` log line.
 * It is the Route Handler counterpart of the Pages-era `createRateLimiter` + `withRequestLog`
 * pair, and shares their Redis counters (`rl:<name>:<ip>`) so a limit stays global when a
 * route moves from one router to the other.
 *
 * Counters live in the Upstash-compatible store when one is configured, otherwise in a small
 * in-process map (per instance, fine for local dev). Store errors fail open: the limiter
 * throttles, `proxy.ts` authenticates.
 */

import type { NextRequest } from "next/server";
import { createRateLimitStore } from "./rateLimitStore";
import { logEvent, sanitizeLogMeta } from "../logger";

/** Per-route limit: at most `max` requests per `windowMs` per client IP. */
export interface RouteLimit {
  /** Short route id, e.g. "report"; namespaces the counter so routes don't share a budget. */
  name: string;
  max: number;
  /** Body of the 429 response. */
  message: string;
  /** Window length in ms (default one minute). */
  windowMs?: number;
}

/** First `x-forwarded-for` entry (Vercel's edge overwrites it), else `x-real-ip`. */
export function getRequestIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

const memoryHits = new Map<string, { hits: number; resetAt: number }>();

/** Fixed-window counter in this process's memory. */
function countInMemory(key: string, windowMs: number): { hits: number; resetAt: number } {
  const now = Date.now();
  if (memoryHits.size > 1000) {
    for (const [k, v] of memoryHits) if (v.resetAt <= now) memoryHits.delete(k);
  }
  let entry = memoryHits.get(key);
  if (!entry || entry.resetAt <= now) entry = { hits: 0, resetAt: now + windowMs };
  entry.hits += 1;
  memoryHits.set(key, entry);
  return entry;
}

/**
 * Wraps `handler`, returning a 429 JSON response once the caller's IP exceeds the limit.
 * Unsupported HTTP methods are rejected by Next itself (405) because only the exported
 * method functions exist.
 */
export function withRoute<Ctx = unknown>(
  { name, max, message, windowMs = 60_000 }: RouteLimit,
  handler: (req: NextRequest, ctx: Ctx) => Promise<Response>,
): (req: NextRequest, ctx?: Ctx) => Promise<Response> {
  const store = createRateLimitStore(name);
  store?.init?.({ windowMs } as never);

  /** Counts this request; returns the window reset time (ms) when over the limit, else null. */
  async function overLimitUntil(ip: string): Promise<number | null> {
    try {
      if (store) {
        const { totalHits, resetTime } = await store.increment(ip);
        return totalHits > max ? (resetTime?.getTime() ?? Date.now() + windowMs) : null;
      }
      const { hits, resetAt } = countInMemory(`${name}:${ip}`, windowMs);
      return hits > max ? resetAt : null;
    } catch {
      return null; // store outage: fail open
    }
  }

  return async (req, ctx) => {
    const start = Date.now();
    let status = 500;
    try {
      const ip = getRequestIp(req);
      const resetAt = await overLimitUntil(ip);
      if (resetAt !== null) {
        logEvent(
          "warn",
          "rate_limit_exceeded",
          "Rate limit exceeded",
          sanitizeLogMeta({ route: name, ip }),
        );
        const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
        const limited = Response.json(
          { error: message },
          { status: 429, headers: { "Retry-After": String(retryAfter) } },
        );
        status = 429;
        return limited;
      }
      const res = await handler(req, ctx as Ctx);
      status = res.status;
      return res;
    } finally {
      logEvent(
        status >= 500 ? "error" : "info",
        "http_request_completed",
        "API request completed",
        // Query strings can carry user-authored content (e.g. ?name=), so log the path only.
        sanitizeLogMeta({
          method: req.method,
          path: req.nextUrl.pathname,
          status,
          durationMs: Date.now() - start,
        }),
      );
    }
  };
}

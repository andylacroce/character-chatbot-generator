/**
 * Shared rate-limit counter storage.
 *
 * Without a store, counters live in the process that served the request (the
 * in-memory map in withRoute.ts). That is exactly right for local development — one process,
 * no infrastructure to run — but on Vercel every warm serverless instance keeps
 * its own copy, so a per-IP limit of N is really N x (concurrent instances).
 *
 * This module supplies a Redis-backed store when the deployment has one attached,
 * and returns `undefined` otherwise so the caller falls back to that in-memory map. The
 * transport is Upstash's REST API, which is what Vercel KV speaks, so no Redis
 * socket or extra dependency is needed in the serverless runtime.
 *
 * Set either pair of environment variables to switch the limits from per-instance
 * to global:
 *   - `KV_REST_API_URL` + `KV_REST_API_TOKEN`                 (Vercel KV / Marketplace Redis)
 *   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`   (Upstash directly)
 */

import logger from "../logger";

/** Counter storage for a limiter's fixed windows. */
export interface RateLimitStore {
  /** Sets the window length (default one minute); call once before the first `increment`. */
  init(options: { windowMs: number }): void;
  /** Counts one hit for `key`, returning the hits in the current window and when it resets. */
  increment(key: string): Promise<{ totalHits: number; resetTime: Date }>;
}

/** Connection details for the Upstash-compatible REST endpoint. */
export interface RedisRestConfig {
  url: string;
  token: string;
}

/** A single Redis command, e.g. `["INCR", "rl:chat:1.2.3.4"]`. */
type RedisCommand = (string | number)[];

/**
 * Reads the REST connection details from the environment.
 * Returns null when no store is configured, which is the normal case locally.
 */
export function getRedisRestConfig(
  env: Record<string, string | undefined> = process.env,
): RedisRestConfig | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  let urlEnd = url.length;
  while (urlEnd > 0 && url.charCodeAt(urlEnd - 1) === 47) urlEnd -= 1;
  return { url: url.slice(0, urlEnd), token };
}

/**
 * An `express-rate-limit` store backed by an Upstash-compatible Redis REST API.
 *
 * Counters are namespaced per limiter (`rl:<name>:<ip>`) because a shared store is
 * shared across routes too: without the namespace, /api/chat and /api/audio would
 * consume each other's budget for the same client.
 *
 * Store errors are thrown rather than swallowed; the limiter is configured with
 * `passOnStoreError` so a Redis outage degrades to "unlimited" instead of failing
 * every request. Authentication is not this layer's job — `proxy.ts` is.
 */
export class RedisRestStore implements RateLimitStore {
  prefix: string;
  private config: RedisRestConfig;
  private windowMs = 60_000;

  constructor(config: RedisRestConfig, name: string) {
    this.config = config;
    this.prefix = `rl:${name}:`;
  }

  init(options: { windowMs: number }): void {
    this.windowMs = options.windowMs;
  }

  /** Sends one or more commands in a single round trip and returns their results. */
  private async pipeline(commands: RedisCommand[]): Promise<unknown[]> {
    const response = await fetch(`${this.config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!response.ok) {
      throw new Error(`Rate limit store responded ${response.status}`);
    }
    const body = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(body)) {
      throw new Error("Rate limit store returned a malformed pipeline response");
    }
    const failed = body.find((entry) => entry && entry.error);
    if (failed) {
      throw new Error(`Rate limit store command failed: ${failed.error}`);
    }
    return body.map((entry) => entry?.result);
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const namespaced = this.prefix + key;
    // SET ... NX establishes the window only on the first hit, so the expiry is
    // anchored to the start of the window rather than sliding with every request.
    const [, hits, ttl] = await this.pipeline([
      ["SET", namespaced, "0", "PX", this.windowMs, "NX"],
      ["INCR", namespaced],
      ["PTTL", namespaced],
    ]);

    const totalHits = Number(hits);
    const remainingMs = Number(ttl);
    if (!Number.isFinite(totalHits)) {
      throw new Error("Rate limit store returned a non-numeric hit count");
    }
    if (remainingMs < 0) {
      // The key lost its expiry (-1) or vanished between commands (-2). Re-arm it
      // so a counter can never be stranded above the limit forever.
      await this.pipeline([["PEXPIRE", namespaced, this.windowMs]]);
      return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
    }
    return { totalHits, resetTime: new Date(Date.now() + remainingMs) };
  }
}

/**
 * Builds the store for a named limiter, or returns undefined to use MemoryStore.
 *
 * @param name - Limiter name, used to keep each route's counters separate.
 */
export function createRateLimitStore(name: string): RateLimitStore | undefined {
  const config = getRedisRestConfig();
  if (!config) return undefined;
  return new RedisRestStore(config, name);
}

/** Shared logger adapter so store errors land in the app's logs, not stdout. */
export const rateLimitLogger = {
  error: (error: unknown, message?: string) =>
    logger.error(message || "Rate limit store error", { error: String(error) }),
  warn: (error: unknown, message?: string) =>
    logger.warn(message || "Rate limit store warning", { error: String(error) }),
};

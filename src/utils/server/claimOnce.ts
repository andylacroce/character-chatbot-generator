/**
 * One-shot claims: "has this key been used before?" answered once, atomically, across every
 * serverless instance when the Upstash-compatible Redis (see `rateLimitStore.ts`) is configured,
 * and per process otherwise (correct for local dev; only partial protection on a multi-instance
 * deployment, which is why production should attach Redis).
 *
 * Fails OPEN: a store outage lets the request through and logs a warning, the same convention as
 * the rate limiter. Used to make a game's turn token single-use (see `utils/game/token.ts`).
 */

import { getRedisRestConfig, redisPipeline } from "./rateLimitStore";
import { logEvent, sanitizeLogMeta } from "../logger";

const MAX_MEMORY_CLAIMS = 1000;
const memoryClaims = new Map<string, number>();

/** Keeps the map bounded: drop expired claims, then the oldest, once it grows past the cap. */
function pruneMemory(now: number) {
  if (memoryClaims.size <= MAX_MEMORY_CLAIMS) return;
  for (const [key, expiresAt] of memoryClaims) if (expiresAt <= now) memoryClaims.delete(key);
  for (const key of memoryClaims.keys()) {
    if (memoryClaims.size <= MAX_MEMORY_CLAIMS) break;
    memoryClaims.delete(key); // Map iterates in insertion order, so this is the oldest claim
  }
}

/**
 * Claims `key` for `ttlSeconds`. Resolves true for the first caller, false for every later one
 * until the claim expires or is released.
 */
export async function claimOnce(key: string, ttlSeconds: number): Promise<boolean> {
  const config = getRedisRestConfig();
  if (!config) {
    const now = Date.now();
    pruneMemory(now);
    const existing = memoryClaims.get(key);
    if (existing !== undefined && existing > now) return false;
    memoryClaims.set(key, now + ttlSeconds * 1000);
    return true;
  }
  try {
    const [result] = await redisPipeline(config, [
      ["SET", `claim:${key}`, "1", "EX", ttlSeconds, "NX"],
    ]);
    return result === "OK";
  } catch (err) {
    logEvent(
      "warn",
      "claim_store_failed",
      "One-shot claim store unavailable; allowing the request",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  }
}

/** Gives a claim back, so a request that failed after claiming can be retried with the same key. */
export async function releaseClaim(key: string): Promise<void> {
  const config = getRedisRestConfig();
  if (!config) {
    memoryClaims.delete(key);
    return;
  }
  try {
    await redisPipeline(config, [["DEL", `claim:${key}`]]);
  } catch (err) {
    logEvent(
      "warn",
      "claim_release_failed",
      "Could not release a one-shot claim",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

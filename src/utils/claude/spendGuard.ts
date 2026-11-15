/**
 * Global daily cap on the `text` tier (Sonnet in production, the only meaningful Claude cost).
 *
 * Usage is counted as weighted tokens (input + 5 x output, roughly Sonnet's price ratio) in a
 * per-UTC-day Redis counter when the store is configured (see `server/rateLimitStore.ts`), else
 * per process. Past `DAILY_TEXT_SOFT_LIMIT` the text tier drops to Haiku; past
 * `DAILY_TEXT_HARD_LIMIT` calls throw `SpendCapError` (routes answer 503). Either limit unset
 * disables that stage. Fails OPEN on a store error, like the rate limiter.
 */

import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages";

import { getRedisRestConfig, redisPipeline } from "../server/rateLimitStore";
import { logEvent, sanitizeLogMeta } from "../logger";
import { getClaudeModel } from "./claudeModelSelector";
import { thinkingFor } from "./claudeThinking";

const OUTPUT_WEIGHT = 5;
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Thrown when the hard daily limit is reached; routes turn it into a 503. */
export class SpendCapError extends Error {
  constructor() {
    super("Daily Claude spend cap reached");
    this.name = "SpendCapError";
  }
}

const memoryTotals = new Map<string, number>();

/** The counter key for today (UTC). */
function dayKey(): string {
  return `spend:text:${new Date().toISOString().slice(0, 10)}`;
}

/** Reads a positive integer limit from the environment, or null when unset or invalid. */
function limit(name: string): number | null {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const lastLoggedDay = new Map<string, string>();

/** Logs `event` at most once per instance per UTC day, so a capped or failing day isn't one line per request. */
function logOncePerDay(
  level: "warn" | "error",
  event: string,
  message: string,
  meta: Record<string, unknown>,
) {
  const day = dayKey();
  if (lastLoggedDay.get(event) === day) return;
  lastLoggedDay.set(event, day);
  logEvent(level, event, message, sanitizeLogMeta(meta));
}

/** Logs a store failure; the caller then lets the request through. */
function storeFailed(event: string, err: unknown) {
  logOncePerDay("warn", event, "Spend counter unavailable; not enforcing the cap", {
    error: err instanceof Error ? err.message : String(err),
  });
}

/** Weighted tokens used today so far. */
async function usedToday(): Promise<number> {
  const config = getRedisRestConfig();
  if (!config) return memoryTotals.get(dayKey()) ?? 0;
  const [value] = await redisPipeline(config, [["GET", dayKey()]]);
  return Number(value ?? 0) || 0;
}

/**
 * The model and thinking setting for a `text` call: the normal tier, Haiku past the soft limit.
 * Throws `SpendCapError` past the hard limit.
 */
export async function textCallSettings(): Promise<{
  model: string;
  thinking: ThinkingConfigParam;
}> {
  const soft = limit("DAILY_TEXT_SOFT_LIMIT");
  const hard = limit("DAILY_TEXT_HARD_LIMIT");
  if (soft || hard) {
    try {
      const used = await usedToday();
      if (hard && used >= hard) {
        logOncePerDay("error", "spend_cap_hard", "Hard daily spend cap reached", { used, hard });
        throw new SpendCapError();
      }
      if (soft && used >= soft) {
        logOncePerDay("warn", "spend_cap_soft", "Soft daily spend cap reached; using Haiku", {
          used,
          soft,
        });
        return { model: getClaudeModel("text-simple"), thinking: thinkingFor("text-simple") };
      }
    } catch (err) {
      if (err instanceof SpendCapError) throw err;
      storeFailed("spend_store_failed", err);
    }
  }
  return { model: getClaudeModel("text"), thinking: thinkingFor("text") };
}

/** Adds one call's usage to today's counter. Never throws. */
export async function recordTextUsage(usage?: {
  input_tokens?: number;
  output_tokens?: number;
}): Promise<void> {
  if (!limit("DAILY_TEXT_SOFT_LIMIT") && !limit("DAILY_TEXT_HARD_LIMIT")) return;
  const weighted = (usage?.input_tokens ?? 0) + OUTPUT_WEIGHT * (usage?.output_tokens ?? 0);
  if (weighted <= 0) return;
  const key = dayKey();
  const config = getRedisRestConfig();
  if (!config) {
    memoryTotals.set(key, (memoryTotals.get(key) ?? 0) + weighted);
    return;
  }
  try {
    await redisPipeline(config, [
      ["INCRBY", key, weighted],
      ["EXPIRE", key, COUNTER_TTL_SECONDS],
    ]);
  } catch (err) {
    storeFailed("spend_record_failed", err);
  }
}

/** Test helper: clears the per-process counter. */
export function resetSpendMemory() {
  memoryTotals.clear();
  lastLoggedDay.clear();
}

import { logEvent, sanitizeLogMeta } from "./logger";

/**
 * Runs a best-effort DB operation for a moderation/observability aid: returns `fallback`
 * without DATABASE_URL, and logs (`error` level) and returns `fallback` on any DB error, so
 * the aid itself never turns into a 500 or blocks the caller's real work.
 */
export async function safeDb<T>(
  event: string,
  message: string,
  fallback: T,
  run: () => Promise<T>,
): Promise<T> {
  if (!process.env.DATABASE_URL) return fallback;
  try {
    return await run();
  } catch (err) {
    logEvent(
      "error",
      event,
      message,
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return fallback;
  }
}

/**
 * Best-effort product-usage event recording, backing the admin-only `/admin` stats view.
 * See src/db/schema.ts's `analyticsEvents` doc comment for why this table exists.
 */

import { getDb } from "../db/client";
import { analyticsEvents } from "../db/schema";
import { getCurrentEnvironment } from "./environment";
import logger from "./logger";

/**
 * Records a product-usage event, degrading silently (no-op or logged failure) rather than
 * ever affecting the caller's response — same resilience pattern as the avatar cache and
 * bot-persistence writes elsewhere in this app.
 */
export async function recordEvent(
  name: string,
  metadata?: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await getDb()
      .insert(analyticsEvents)
      .values({
        name,
        environment: getCurrentEnvironment(),
        userId: userId ?? null,
        metadata: metadata ?? null,
      });
  } catch (err) {
    logger.error("Failed to record analytics event:", { error: err, name });
  }
}

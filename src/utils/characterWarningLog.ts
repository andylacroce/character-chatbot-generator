/**
 * Access to the append-only warning log (src/db/schema.ts's `character_warning_log`
 * table) — every "warning"-level copyright/trademark classification Claude has ever
 * returned from pages/api/validate-character.ts, independent of the current
 * allow/block state of that name (see the table's own doc comment for why a
 * deduplicated table can't serve this). Backs the /admin/moderation page's
 * "Recently warned" panel (pages/api/admin/warnings.ts).
 *
 * Degrades gracefully (no-op / empty) without DATABASE_URL or on any DB error — this
 * is an observability aid, never something that should block validate-character's
 * actual response to the user.
 */

import { desc } from "drizzle-orm";
import { getDb } from "../db/client";
import { characterWarningLog } from "../db/schema";
import { logEvent, sanitizeLogMeta } from "./logger";

export interface WarningLogEntry {
  characterName: string;
  displayName: string | null;
  reason: string | null;
  createdAt: Date;
}

/** Records a single warning-level classification event. Best-effort, fire-and-forget from the caller. */
export async function logWarning(name: string, reason: string | null): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await getDb()
      .insert(characterWarningLog)
      .values({ characterName: name, displayName: name, reason });
  } catch (err) {
    logEvent(
      "error",
      "character_warning_log_write_failed",
      "Warning log write failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

/** Lists every warning event, newest first, for the /admin/moderation "Recently warned" panel. */
export async function listWarnings(): Promise<WarningLogEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await getDb()
      .select()
      .from(characterWarningLog)
      .orderBy(desc(characterWarningLog.createdAt));
  } catch (err) {
    logEvent(
      "error",
      "character_warning_log_list_failed",
      "Warning log list failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return [];
  }
}

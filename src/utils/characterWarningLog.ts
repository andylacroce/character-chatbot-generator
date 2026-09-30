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
import { safeDb } from "./safeDb";

export interface WarningLogEntry {
  characterName: string;
  displayName: string | null;
  reason: string | null;
  createdAt: Date;
}

/** Records a single warning-level classification event. Best-effort, fire-and-forget from the caller. */
export function logWarning(name: string, reason: string | null): Promise<void> {
  return safeDb(
    "character_warning_log_write_failed",
    "Warning log write failed",
    undefined,
    async () => {
      await getDb()
        .insert(characterWarningLog)
        .values({ characterName: name, displayName: name, reason });
    },
  );
}

/** Lists every warning event, newest first, for the /admin/moderation "Recently warned" panel. */
export function listWarnings(): Promise<WarningLogEntry[]> {
  return safeDb("character_warning_log_list_failed", "Warning log list failed", [], () =>
    getDb().select().from(characterWarningLog).orderBy(desc(characterWarningLog.createdAt)),
  );
}

/**
 * Access to the persistent character-name blocklist (src/db/schema.ts's
 * `characterBlocklist` table) — names known to fail copyright/trademark review,
 * checked by pages/api/validate-character.ts before ever calling Claude, and
 * manageable from the /admin blocklist panel (pages/api/admin/blocklist.ts).
 *
 * Every function here degrades gracefully (no-op / empty / null) without
 * DATABASE_URL or on any DB error — this is a moderation aid, never something that
 * should itself turn into a 500 or block character creation outright.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { characterBlocklist } from "../db/schema";
import { logEvent, sanitizeLogMeta } from "./logger";

/** Lowercased so lookups are case-insensitive, same convention as avatarCache. */
function blocklistKey(name: string): string {
  return name.toLowerCase();
}

export interface BlocklistEntry {
  characterName: string;
  displayName: string | null;
  reason: string | null;
  source: string;
  category: string;
  createdAt: Date;
}

/**
 * Looks up a name in the blocklist. Returns the matching entry, or null on a miss,
 * without DATABASE_URL, or on any DB error.
 */
export async function getBlocklistEntry(name: string): Promise<BlocklistEntry | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await getDb()
      .select()
      .from(characterBlocklist)
      .where(eq(characterBlocklist.characterName, blocklistKey(name)));
    return rows[0] ?? null;
  } catch (err) {
    logEvent(
      "error",
      "character_blocklist_lookup_failed",
      "Blocklist lookup failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return null;
  }
}

/**
 * Adds (or refreshes) a name on the blocklist. Best-effort — a write failure is
 * logged and swallowed rather than failing the caller's request, since the caller's
 * own response to the user doesn't depend on this succeeding.
 *
 * `category` is required (not defaulted) so every call site states explicitly which
 * fast-path response shape a future lookup should produce — see the table's own doc
 * comment in src/db/schema.ts for what "copyright" vs "content" each mean.
 */
export async function addToBlocklist(
  name: string,
  reason: string | null,
  source: "claude" | "admin",
  category: "copyright" | "content",
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await getDb()
      .insert(characterBlocklist)
      .values({
        characterName: blocklistKey(name),
        displayName: name,
        reason,
        source,
        category,
      })
      .onConflictDoUpdate({
        target: characterBlocklist.characterName,
        set: { reason, source, category },
      });
  } catch (err) {
    logEvent(
      "error",
      "character_blocklist_write_failed",
      "Blocklist write failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

/** Removes a name from the blocklist (an admin "unblock" action). Returns whether a row existed. */
export async function removeFromBlocklist(name: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const deleted = await getDb()
      .delete(characterBlocklist)
      .where(eq(characterBlocklist.characterName, blocklistKey(name)))
      .returning({ characterName: characterBlocklist.characterName });
    return deleted.length > 0;
  } catch (err) {
    logEvent(
      "error",
      "character_blocklist_delete_failed",
      "Blocklist delete failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return false;
  }
}

/** Lists every blocklisted name, newest first, for the /admin blocklist panel. */
export async function listBlocklist(): Promise<BlocklistEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await getDb().select().from(characterBlocklist).orderBy(characterBlocklist.createdAt);
  } catch (err) {
    logEvent(
      "error",
      "character_blocklist_list_failed",
      "Blocklist list failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return [];
  }
}

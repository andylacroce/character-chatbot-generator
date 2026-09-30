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
import { safeDb } from "./safeDb";

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
export function getBlocklistEntry(name: string): Promise<BlocklistEntry | null> {
  return safeDb("character_blocklist_lookup_failed", "Blocklist lookup failed", null, async () => {
    const rows = await getDb()
      .select()
      .from(characterBlocklist)
      .where(eq(characterBlocklist.characterName, blocklistKey(name)));
    return rows[0] ?? null;
  });
}

/**
 * Adds (or refreshes) a name on the blocklist. Best-effort: a write failure is logged
 * and swallowed rather than failing the caller's request.
 *
 * `category` is required (not defaulted) so every call site states explicitly which
 * fast-path response shape a future lookup should produce; see the table's own doc
 * comment in src/db/schema.ts for what "copyright" vs "content" each mean.
 */
export function addToBlocklist(
  name: string,
  reason: string | null,
  source: "claude" | "admin",
  category: "copyright" | "content",
): Promise<void> {
  return safeDb(
    "character_blocklist_write_failed",
    "Blocklist write failed",
    undefined,
    async () => {
      await getDb()
        .insert(characterBlocklist)
        .values({ characterName: blocklistKey(name), displayName: name, reason, source, category })
        .onConflictDoUpdate({
          target: characterBlocklist.characterName,
          set: { reason, source, category },
        });
    },
  );
}

/** Removes a name from the blocklist (an admin "unblock" action). Returns whether a row existed. */
export function removeFromBlocklist(name: string): Promise<boolean> {
  return safeDb("character_blocklist_delete_failed", "Blocklist delete failed", false, async () => {
    const deleted = await getDb()
      .delete(characterBlocklist)
      .where(eq(characterBlocklist.characterName, blocklistKey(name)))
      .returning({ characterName: characterBlocklist.characterName });
    return deleted.length > 0;
  });
}

/** Lists every blocklisted name, oldest first, for the /admin blocklist panel. */
export function listBlocklist(): Promise<BlocklistEntry[]> {
  return safeDb("character_blocklist_list_failed", "Blocklist list failed", [], () =>
    getDb().select().from(characterBlocklist).orderBy(characterBlocklist.createdAt),
  );
}

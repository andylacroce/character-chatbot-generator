/**
 * Two sources of "this name is permanently copyright-safe, don't even ask Claude":
 *
 * 1. A static, hand-curated set built from src/data/characterNames.ts — the same
 *    "1000+ public domain characters: mythology, folklore, literature (pre-1928),
 *    and history" list already trusted elsewhere in this app (random character
 *    selection, the guessing game's round pool). Exists because a live sweep found
 *    Claude flagging "warning" on names from exactly that list (Sherlock Holmes,
 *    Thor, Winnie-the-Pooh) purely because a modern studio also made a popular
 *    adaptation of a mythological/historical/pre-1928 figure.
 * 2. `character_allowlist` (src/db/schema.ts) — an admin-managed table for a name
 *    that isn't on the static list but an admin wants permanently allowed anyway
 *    (e.g. the live report that motivated this table: "Alice Munro," a real person
 *    not in the curated list at all). Managed from /admin/moderation alongside the
 *    blocklist (see src/utils/characterBlocklist.ts, pages/api/admin/moderation.ts).
 *
 * pages/api/validate-character.ts checks both (isAllowlisted) before ever calling
 * Claude. Every DB function degrades gracefully (no-op / empty / null) without
 * DATABASE_URL or on any DB error, same as characterBlocklist.ts.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { characterAllowlist } from "../db/schema";
import { logEvent, sanitizeLogMeta } from "./logger";
import characterNames from "../data/characterNames";

const CURATED_ALLOWLIST = new Set(characterNames.map((name) => name.toLowerCase()));

/** Lowercased so lookups are case-insensitive, same convention as avatarCache/characterBlocklist. */
function allowlistKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Whether `name` is on the static, hand-curated public-domain list (case-insensitive, exact match). */
export function isCuratedAllowlisted(name: string): boolean {
  return CURATED_ALLOWLIST.has(allowlistKey(name));
}

export interface AllowlistEntry {
  characterName: string;
  displayName: string | null;
  reason: string | null;
  source: string;
  createdAt: Date;
}

/** Looks up a name in the admin-managed allowlist table. Null on a miss, without DATABASE_URL, or on any DB error. */
export async function getAllowlistEntry(name: string): Promise<AllowlistEntry | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await getDb()
      .select()
      .from(characterAllowlist)
      .where(eq(characterAllowlist.characterName, allowlistKey(name)));
    return rows[0] ?? null;
  } catch (err) {
    logEvent(
      "error",
      "character_allowlist_lookup_failed",
      "Allowlist lookup failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return null;
  }
}

/** Combined check: the static curated list, or the admin-managed table. */
export async function isAllowlisted(name: string): Promise<boolean> {
  if (isCuratedAllowlisted(name)) return true;
  return (await getAllowlistEntry(name)) !== null;
}

/** Adds (or refreshes) a name on the admin-managed allowlist. Best-effort. */
export async function addToAllowlist(name: string, reason: string | null): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await getDb()
      .insert(characterAllowlist)
      .values({ characterName: allowlistKey(name), displayName: name, reason, source: "admin" })
      .onConflictDoUpdate({
        target: characterAllowlist.characterName,
        set: { reason },
      });
  } catch (err) {
    logEvent(
      "error",
      "character_allowlist_write_failed",
      "Allowlist write failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

/** Removes a name from the admin-managed allowlist. Returns whether a row existed. Never touches the static curated list. */
export async function removeFromAllowlist(name: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const deleted = await getDb()
      .delete(characterAllowlist)
      .where(eq(characterAllowlist.characterName, allowlistKey(name)))
      .returning({ characterName: characterAllowlist.characterName });
    return deleted.length > 0;
  } catch (err) {
    logEvent(
      "error",
      "character_allowlist_delete_failed",
      "Allowlist delete failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return false;
  }
}

/** Lists every admin-managed allowlist entry, newest first, for the /admin/moderation panel. */
export async function listAllowlist(): Promise<AllowlistEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await getDb().select().from(characterAllowlist).orderBy(characterAllowlist.createdAt);
  } catch (err) {
    logEvent(
      "error",
      "character_allowlist_list_failed",
      "Allowlist list failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return [];
  }
}

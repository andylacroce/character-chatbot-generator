/**
 * The shared avatar store: the global `avatar_cache` table (keyed by lowercased name, shared
 * by every user and environment), Vercel Blob uploads, and the moderation scrubs that remove
 * a name's portrait and saved characters. Every read and write degrades quietly without
 * `DATABASE_URL` or on error. Generation lives in avatarGeneration.ts.
 */

import { put } from "@vercel/blob";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { logEvent, sanitizeLogMeta } from "../logger";
import { getDb } from "../../db/client";
import { avatarCache, bots } from "../../db/schema";
import { deleteOrphanedAvatars } from "../account/userBlobs";
import type { CharacterCategory } from "character-chatbot-shared/src/core";

/**
 * Uploads a base64 data URL image to Vercel Blob and returns its durable public URL.
 * Falls back to returning the original data URL when no Blob token is configured (local
 * dev with no Blob store set up) or if the upload itself fails, so avatar generation
 * never fails outright over storage.
 */
export async function persistAvatarToBlob(dataUrl: string): Promise<string> {
  const blobToken = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) return dataUrl;

  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) return dataUrl;
  const [, mimeType, base64Data] = match;
  const ext = mimeType.split("/")[1] || "png";

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const blob = await put(`avatars/${crypto.randomUUID()}.${ext}`, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: mimeType,
      token: blobToken,
    });
    return blob.url;
  } catch (err) {
    logEvent(
      "error",
      "avatar_blob_upload_failed",
      "Failed to upload avatar to Blob, using data URL",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return dataUrl;
  }
}

/** Cache key: lowercased so "Sherlock Holmes" and "sherlock holmes" share a hit. */
function avatarCacheKey(sanitizedName: string): string {
  return sanitizedName.toLowerCase();
}

/**
 * Looks up a previously-generated avatar shared across every user (and guests) by
 * character name — even a free image provider isn't instant, so a name generated
 * once is reused from then on. Returns null on a miss, when no
 * DATABASE_URL is configured, or on any DB error — caching is a cost optimization,
 * never a requirement for avatar generation to work.
 */
export async function getCachedAvatar(
  sanitizedName: string,
): Promise<{ avatarUrl: string; gender: string | null } | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await getDb()
      .select()
      .from(avatarCache)
      .where(eq(avatarCache.characterName, avatarCacheKey(sanitizedName)));
    const row = rows[0];
    return row ? { avatarUrl: row.avatarUrl, gender: row.gender } : null;
  } catch (err) {
    logEvent(
      "error",
      "avatar_cache_lookup_failed",
      "Avatar cache lookup failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return null;
  }
}

/**
 * Stores a successfully-generated avatar in the shared cache. Never called with the
 * `/silhouette.svg` fallback — caching a failure would permanently deny a name a
 * real portrait even after a transient provider outage resolves. Best-effort: a
 * failure here doesn't fail the request, since the caller already has their avatar.
 * `recognized` remains true for all newly generated rows. The column is retained for
 * legacy data written before original-character creation was retired.
 */
export async function cacheAvatar(
  sanitizedName: string,
  avatarUrl: string,
  gender: string | null,
  recognized: boolean,
  category: CharacterCategory | null,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    // sanitizedName is the properly-cased name as Claude produced it (generate-
    // personality's correctedName, or the guessing game's curated name) — capture it as
    // displayName here, since this is the one place that casing is actually known; the
    // lowercased characterName key stays case-insensitive for lookups.
    await getDb()
      .insert(avatarCache)
      .values({
        characterName: avatarCacheKey(sanitizedName),
        avatarUrl,
        gender,
        recognized,
        displayName: sanitizedName,
        category,
      })
      .onConflictDoUpdate({
        target: avatarCache.characterName,
        // A null category never erases an existing one (admin regenerate keeps the row's group).
        set: {
          avatarUrl,
          gender,
          recognized,
          displayName: sanitizedName,
          ...(category && { category }),
        },
      });
  } catch (err) {
    logEvent(
      "error",
      "avatar_cache_write_failed",
      "Avatar cache write failed",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

/**
 * Deletes a character's row from the shared avatar cache entirely — a moderation
 * action, not a cost-optimization path like the functions above. Used when a live
 * re-check (app/api/validate-character/route.ts) flags a name that was previously
 * cached/publicly displayed on the Character Wall/carousel as a copyright/trademark
 * "warning": rather than just leaving a bad name cached, this removes it so it stops
 * being served/shown going forward. Returns whether a row actually existed to delete,
 * so the caller can tell "an already-public character just got flagged" apart from "this
 * name was never cached to begin with" (the latter gets the ordinary, overridable
 * warning flow instead — see validate-character.ts). No-op (returns false) without
 * DATABASE_URL or on any DB error, same degrade-gracefully shape as every other
 * avatar_cache access here — a scrub failure should never itself become a 500.
 */
export async function scrubCachedAvatar(name: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    return (await deleteAvatarRow(name)) !== null;
  } catch (err) {
    logEvent(
      "error",
      "avatar_cache_scrub_failed",
      "Failed to scrub cached avatar after a copyright re-check",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return false;
  }
}

/** Deletes a name's `avatar_cache` row, resolving its old portrait URL (null if none). Throws on DB failure. */
async function deleteAvatarRow(name: string): Promise<string | null> {
  const deleted = await getDb()
    .delete(avatarCache)
    .where(eq(avatarCache.characterName, avatarCacheKey(name)))
    .returning({ avatarUrl: avatarCache.avatarUrl });
  return deleted[0]?.avatarUrl ?? null;
}

/**
 * Admin purge of one character's shared portrait, so the next creation of that name
 * generates a fresh one (it also drops off the Wall until then). Unlike a blocklist scrub it
 * leaves users' saved characters alone; the old Blob image is deleted only if no saved
 * character still uses it. Returns whether a row existed; throws on DB failure so the
 * admin sees the error instead of a false "purged".
 */
export async function purgeCachedAvatar(name: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const avatarUrl = await deleteAvatarRow(name);
  if (avatarUrl === null) return false;
  try {
    await deleteOrphanedAvatars([avatarUrl]);
  } catch (err) {
    logEvent(
      "warn",
      "avatar_purge_blob_failed",
      "Purged avatar_cache row but left its Blob image behind",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
  return true;
}

/**
 * Admin recategorization of one cached character. Returns whether a row existed; throws on DB
 * failure so the admin sees the error instead of a false success.
 */
export async function setCachedCategory(
  name: string,
  category: CharacterCategory,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const rows = await getDb()
    .update(avatarCache)
    .set({ category })
    .where(eq(avatarCache.characterName, avatarCacheKey(name)))
    .returning({ name: avatarCache.characterName });
  return rows.length > 0;
}

/**
 * Deletes every signed-in user's own saved `bots` row matching this name
 * case-insensitively — across every user and every environment, not just the one the
 * request happened to come from, since a blocklist concern is global (see
 * characterBlocklist.ts's doc comment). Added 2026-09-17 alongside the living-person
 * legal-risk guardrail: scrubbing only the shared avatar_cache (scrubCachedAvatar
 * above) would leave a user's own already-saved copy of a now-blocked name — and its
 * full chat history — untouched, even though it's the same underlying concern. A
 * user's own saved bot is never public on its own (only the shared, `recognized`
 * avatar_cache rows populate /characters), but this app doesn't want to keep hosting it
 * privately either once a name is blocked outright.
 *
 * `messages` rows cascade-delete automatically via their FK to `bots.id`
 * (`onDelete: "cascade"`, see src/db/schema.ts) — no separate messages cleanup needed.
 * A plain `lower()` SQL comparison, not `ilike`, since `bots.name` isn't pre-lowercased
 * at write time (unlike avatarCache/blocklist's own keys) and a name containing a
 * literal `%`/`_` shouldn't be treated as an ILIKE wildcard. Returns the number of
 * bots rows removed (0 on no match, no DATABASE_URL, or any DB error).
 */
export async function scrubUserBotsByName(name: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    const deleted = await getDb()
      .delete(bots)
      .where(sql`lower(${bots.name}) = lower(${name})`)
      .returning({ id: bots.id });
    return deleted.length;
  } catch (err) {
    logEvent(
      "error",
      "user_bots_scrub_failed",
      "Failed to scrub user-saved bots for a blocked character name",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return 0;
  }
}

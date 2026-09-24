/**
 * A signed-in user's own Vercel Blob files: chat troubleshooting logs
 * (pages/api/log-message.ts) and portraits made only for their characters. Shared by
 * account deletion (pages/api/account.ts) and clearing chat history (pages/api/bots.ts).
 *
 * A user's logs live under a per-account prefix (a hash of their user id, since log
 * blobs are publicly addressable) so they can be found and removed; guest logs have no
 * account to attach to and stay at the root.
 */

import crypto from "crypto";
import { del, list } from "@vercel/blob";
import { inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { avatarCache, bots } from "../db/schema";

const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

/** Blob/local path prefix for a user's chat logs, or "" for a guest. */
export function chatLogPrefix(userId: string | null): string {
  if (!userId) return "";
  return `chat-logs/users/${crypto.createHash("sha256").update(userId).digest("hex")}/`;
}

/** Deletes every chat log blob under a user's prefix; returns how many were removed. */
async function deleteUserChatLogs(userId: string, token: string): Promise<number> {
  const prefix = chatLogPrefix(userId);
  let removed = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, token });
    if (page.blobs.length > 0) {
      await del(
        page.blobs.map((blob) => blob.url),
        { token },
      );
      removed += page.blobs.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return removed;
}

/** Whether a stored avatar URL points at this app's Vercel Blob store (vs. a data URL or static asset). */
function isBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** Deletes Blob avatars no remaining `avatar_cache`/`bots` row references; returns how many were removed. */
async function deleteOrphanedAvatars(
  avatarUrls: (string | null)[],
  token: string,
): Promise<number> {
  const candidates = [...new Set(avatarUrls)].filter(
    (url): url is string => !!url && isBlobUrl(url),
  );
  if (candidates.length === 0) return 0;

  const db = getDb();
  const [cached, stillUsed] = await Promise.all([
    db
      .select({ url: avatarCache.avatarUrl })
      .from(avatarCache)
      .where(inArray(avatarCache.avatarUrl, candidates)),
    db.select({ url: bots.avatarUrl }).from(bots).where(inArray(bots.avatarUrl, candidates)),
  ]);
  const shared = new Set([...cached, ...stillUsed].map((row) => row.url));
  const orphaned = candidates.filter((url) => !shared.has(url));
  if (orphaned.length > 0) await del(orphaned, { token });
  return orphaned.length;
}

/**
 * Call after deleting a user's `bots` rows: removes the portraits only those rows used,
 * plus (unless `chatLogs: false`, for deleting a single character, since logs are
 * per-account rather than per-character) the user's chat logs. No-op without a Blob
 * token. Returns how many blobs were removed; throws on a Blob/DB failure so the caller
 * can log it.
 */
export async function deleteUserBlobs(
  userId: string,
  deletedAvatarUrls: (string | null)[],
  { chatLogs = true }: { chatLogs?: boolean } = {},
): Promise<number> {
  const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return 0;
  const avatars = await deleteOrphanedAvatars(deletedAvatarUrls, token);
  return chatLogs ? avatars + (await deleteUserChatLogs(userId, token)) : avatars;
}

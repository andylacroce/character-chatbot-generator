/**
 * API endpoint for a signed-in user to permanently delete their own account.
 *
 * Deleting the `users` row cascades (src/db/schema.ts) to `accounts`, `bots`,
 * `messages`, `game_high_scores`, and the account's `game_results`; `analytics_events`
 * rows are `set null`, leaving only anonymous aggregate counts. This handler also
 * erases what the cascade can't reach: the email's pending magic-link tokens, this
 * browser/device's guest game identity and rows, and any Vercel Blob avatar that only
 * this user's characters referenced (a shared `avatar_cache` portrait stays, since it
 * isn't theirs alone), plus their chat troubleshooting logs (utils/userBlobs.ts).
 * Everything happens before the response is sent.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { bots, gameGuestProfiles, gameResults, users, verificationTokens } from "../../db/schema";
import { getSessionUserId } from "../../utils/getSessionUserId";
import { deleteUserBlobs } from "../../utils/userBlobs";
import { clearGuestId, getGuestId } from "../../utils/gameGuestIdentity";
import { createRateLimiter, applyRateLimit } from "../../utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import { withRequestLog } from "../../utils/withRequestLog";

/** Rate limiter: 5 requests per minute per IP. */
const accountRateLimit = createRateLimiter({
  name: "account",
  max: 5,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler for deleting the signed-in user's account and its data.
 *
 * @swagger
 * /account:
 *   delete:
 *     summary: Permanently delete the signed-in user's account
 *     description: >
 *       Erases the account and everything tied to it (saved characters, chat history,
 *       preferred name, game scores, leaderboard name, magic-link tokens, private
 *       avatar images, chat logs), plus this browser's guest game identity. Irreversible.
 *     tags: [Account]
 *     responses:
 *       200:
 *         description: Account deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted:
 *                   type: boolean
 *       401:
 *         description: Not signed in
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to delete account
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(accountRateLimit, req, res))) return;

  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(200).json({ deleted: false });
    return;
  }

  const db = getDb();
  let avatarUrls: (string | null)[];
  try {
    const botRows = await db
      .select({ avatarUrl: bots.avatarUrl })
      .from(bots)
      .where(eq(bots.userId, userId));
    avatarUrls = botRows.map((row) => row.avatarUrl);

    const deletedUsers = await db
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ email: users.email });
    const email = deletedUsers[0]?.email;
    if (email) {
      await db.delete(verificationTokens).where(eq(verificationTokens.identifier, email));
    }

    const guestId = getGuestId(req);
    if (guestId) {
      await Promise.all([
        db.delete(gameResults).where(eq(gameResults.guestId, guestId)),
        db.delete(gameGuestProfiles).where(eq(gameGuestProfiles.guestId, guestId)),
      ]);
      clearGuestId(res);
    }
  } catch (err) {
    logEvent(
      "error",
      "account_delete_failed",
      "Failed to delete account",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to delete account" });
    return;
  }

  // The account itself is gone at this point; a Blob failure is logged for manual
  // cleanup rather than reported as a failed deletion the user would retry in vain.
  let blobsDeleted = 0;
  try {
    blobsDeleted = await deleteUserBlobs(userId, avatarUrls);
  } catch (err) {
    logEvent(
      "error",
      "account_delete_blob_failed",
      "Account deleted but its avatar images or chat logs could not be removed",
      sanitizeLogMeta({
        error: err instanceof Error ? err.message : String(err),
        urls: avatarUrls,
      }),
    );
  }

  logEvent("info", "account_deleted", "Account deleted", sanitizeLogMeta({ blobsDeleted }));
  res.status(200).json({ deleted: true });
}

export default withRequestLog(handler);

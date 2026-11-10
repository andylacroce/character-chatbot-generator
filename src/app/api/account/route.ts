/**
 * API endpoint for a signed-in user to permanently delete their own account.
 *
 * Deleting the `users` row cascades (src/db/schema.ts) to `accounts`, `bots`,
 * `messages`, and both games' account-scoped high-score/result tables
 * (`guess_who_high_scores`/`guess_who_results` and
 * `guess_who_next_high_scores`/`guess_who_next_results`); `analytics_events` rows are
 * `set null`, leaving only anonymous aggregate counts. This handler also erases what the
 * cascade can't reach: the email's pending magic-link tokens, this browser/device's
 * guest game identity and rows (both games' guest-scoped result/leaderboard-profile
 * tables — a guest row is keyed by cookie, not `user_id`, so no FK cascade reaches it),
 * and any Vercel Blob avatar that only this user's characters referenced (a shared
 * `avatar_cache` portrait stays, since it isn't theirs alone), plus their chat
 * troubleshooting logs (utils/userBlobs.ts). Everything happens before the response is
 * sent.
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/client";
import {
  bots,
  guessWhoGuestProfiles,
  guessWhoNextGuestProfiles,
  guessWhoNextResults,
  guessWhoResults,
  users,
  verificationTokens,
} from "../../../db/schema";
import { getSessionUserId } from "../../../utils/account/getSessionUserId";
import { deleteUserBlobs } from "../../../utils/account/userBlobs";
import { CLEAR_GUEST_COOKIE, getGuestId } from "../../../utils/game/gameGuestIdentity";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRoute } from "../../../utils/server/withRoute";

const LIMIT = {
  name: "account",
  max: 5,
  message: "Too many requests from this IP, please try again later.",
};

/**
 * Deletes the signed-in user's account and its data.
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
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to delete account
 */
export const DELETE = withRoute(LIMIT, async (req: NextRequest) => {
  const userId = await getSessionUserId(req);
  if (!userId) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ deleted: false });
  }

  const db = getDb();
  let avatarUrls: (string | null)[];
  let clearGuestCookie = false;
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
      clearGuestCookie = true;
      await Promise.all([
        db.delete(guessWhoNextResults).where(eq(guessWhoNextResults.guestId, guestId)),
        db.delete(guessWhoNextGuestProfiles).where(eq(guessWhoNextGuestProfiles.guestId, guestId)),
        db.delete(guessWhoResults).where(eq(guessWhoResults.guestId, guestId)),
        db.delete(guessWhoGuestProfiles).where(eq(guessWhoGuestProfiles.guestId, guestId)),
      ]);
    }
  } catch (err) {
    logEvent(
      "error",
      "account_delete_failed",
      "Failed to delete account",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return Response.json({ error: "Failed to delete account" }, { status: 500 });
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
  const res = Response.json({ deleted: true });
  if (clearGuestCookie) res.headers.append("Set-Cookie", CLEAR_GUEST_COOKIE);
  return res;
});

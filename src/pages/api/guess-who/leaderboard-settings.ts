/**
 * Public leaderboard visibility setting for an account or guest browser, for "Guess
 * Who". Mirrors guess-who-next/leaderboard-settings.ts, with one deliberate asymmetry:
 * a signed-in user's opt-in name/visibility (`users.showOnLeaderboard`/`leaderboardName`)
 * is the SAME single field shared with "Guess Who's Next" — one account, one public
 * leaderboard identity, consistent with how this app treats a signed-in user's identity
 * everywhere else (e.g. `preferredName`). A GUEST's identity is per-game instead
 * (`guessWhoGuestProfiles`, separate from `guessWhoNextGuestProfiles`), since a guest's
 * game-guest id is the same across both games but there's no equivalent "one account"
 * reasoning forcing their opt-in choice to be shared — the schema already keeps guest
 * profiles as separate tables per game (see db/schema.ts's doc comment), so this simply
 * follows that existing shape rather than introducing a new users-table column.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/client";
import { guessWhoGuestProfiles, users } from "../../../db/schema";
import { isTopTenPlayer } from "../../../utils/guessWhoLeaderboard";
import { checkLeaderboardName } from "../../../utils/leaderboardName";
import { getGuestId } from "../../../utils/gameGuestIdentity";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/withRequestLog";

const guessWhoLeaderboardSettingsRateLimit = createRateLimiter({
  name: "guess-who-leaderboard-settings",
  max: 5,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Reads or changes this account or guest browser's public Guess Who score visibility.
 *
 * @swagger
 * /guess-who/leaderboard-settings:
 *   get:
 *     summary: Get this player's Guess Who leaderboard visibility
 *     tags: [GuessWho]
 *     responses:
 *       200:
 *         description: Current opt-in setting, or unavailable for guests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available: { type: boolean }
 *                 showOnLeaderboard: { type: boolean }
 *                 eligible: { type: boolean }
 *                 name: { type: string, nullable: true }
 *   post:
 *     summary: Submit a moderated name or leave the public Guess Who leaderboard
 *     tags: [GuessWho]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [showOnLeaderboard]
 *             properties:
 *               showOnLeaderboard: { type: boolean }
 *               name: { type: string, description: Required when opting in }
 *     responses:
 *       200:
 *         description: Setting saved
 *       400:
 *         description: Invalid setting
 *       401:
 *         description: No account or guest game identity
 *       403:
 *         description: A top-ten score is required to opt in
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       503:
 *         description: Name moderation is unavailable
 *       500:
 *         description: Failed to load or save setting
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(guessWhoLeaderboardSettingsRateLimit, req, res))) return;
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }
  const userId = await getSessionUserId(req);
  const guestId = userId ? null : getGuestId(req);
  if ((!userId && !guestId) || !process.env.DATABASE_URL) {
    if (req.method === "GET") {
      res
        .status(200)
        .json({ available: false, showOnLeaderboard: false, eligible: false, name: null });
    } else {
      res.status(401).json({ error: "Play a game to join the leaderboard" });
    }
    return;
  }
  if (req.method === "POST" && typeof req.body?.showOnLeaderboard !== "boolean") {
    res.status(400).json({ error: "Invalid leaderboard setting" });
    return;
  }
  try {
    const identity = userId ? { userId } : { guestId: guestId! };
    if (req.method === "GET") {
      const rows = userId
        ? await getDb()
            .select({ showOnLeaderboard: users.showOnLeaderboard, name: users.leaderboardName })
            .from(users)
            .where(eq(users.id, userId))
        : await getDb()
            .select({
              showOnLeaderboard: guessWhoGuestProfiles.showOnLeaderboard,
              name: guessWhoGuestProfiles.leaderboardName,
            })
            .from(guessWhoGuestProfiles)
            .where(eq(guessWhoGuestProfiles.guestId, guestId!));
      res.status(200).json({
        available: true,
        showOnLeaderboard: rows[0]?.showOnLeaderboard ?? false,
        eligible: await isTopTenPlayer(identity),
        name: rows[0]?.name ?? null,
      });
    } else {
      if (req.body.showOnLeaderboard && !(await isTopTenPlayer(identity))) {
        res.status(403).json({ error: "Reach the top 10 to join the leaderboard" });
        return;
      }
      const checked = req.body.showOnLeaderboard ? await checkLeaderboardName(req.body.name) : null;
      if (checked?.status === "rejected") {
        res.status(400).json({ error: "Choose a different display name" });
        return;
      }
      if (checked?.status === "unavailable") {
        res.status(503).json({ error: "Name check is temporarily unavailable" });
        return;
      }
      const setting = {
        showOnLeaderboard: req.body.showOnLeaderboard as boolean,
        ...(checked?.status === "approved" ? { leaderboardName: checked.name } : {}),
      };
      const rows = userId
        ? await getDb()
            .update(users)
            .set(setting)
            .where(eq(users.id, userId))
            .returning({ showOnLeaderboard: users.showOnLeaderboard, name: users.leaderboardName })
        : await getDb()
            .insert(guessWhoGuestProfiles)
            .values({ guestId: guestId!, ...setting })
            .onConflictDoUpdate({ target: guessWhoGuestProfiles.guestId, set: setting })
            .returning({
              showOnLeaderboard: guessWhoGuestProfiles.showOnLeaderboard,
              name: guessWhoGuestProfiles.leaderboardName,
            });
      if (!rows[0]) {
        res.status(401).json({ error: "Account unavailable" });
        return;
      }
      res.status(200).json({
        available: true,
        showOnLeaderboard: rows[0].showOnLeaderboard,
        eligible: await isTopTenPlayer(identity),
        name: rows[0].name,
      });
    }
  } catch (err) {
    logEvent(
      "error",
      "guess_who_leaderboard_settings_failed",
      "Failed to load or save leaderboard setting",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to update leaderboard setting" });
  }
}

export default withRequestLog(handler);

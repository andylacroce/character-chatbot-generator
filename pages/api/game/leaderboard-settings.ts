/** Public leaderboard visibility setting for an account or guest browser. */

import type { NextApiRequest, NextApiResponse } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "../../../src/db/client";
import { gameGuestProfiles, users } from "../../../src/db/schema";
import { isTopTenPlayer } from "../../../src/utils/gameLeaderboard";
import { checkLeaderboardName } from "../../../src/utils/leaderboardName";
import { getGuestId } from "../../../src/utils/gameGuestIdentity";
import { getSessionUserId } from "../../../src/utils/getSessionUserId";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";
import { withRequestLog } from "../../../src/utils/withRequestLog";

const leaderboardSettingsRateLimit = createRateLimiter({
  name: "game-leaderboard-settings",
  max: 5,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Reads or changes this account or guest browser's public score visibility.
 *
 * @swagger
 * /game/leaderboard-settings:
 *   get:
 *     summary: Get this player's leaderboard visibility
 *     tags: [Game]
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
 *     summary: Submit a moderated name or leave the public leaderboard
 *     tags: [Game]
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
  if (!(await applyRateLimit(leaderboardSettingsRateLimit, req, res))) return;
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }
  const userId = await getSessionUserId(req, res);
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
              showOnLeaderboard: gameGuestProfiles.showOnLeaderboard,
              name: gameGuestProfiles.leaderboardName,
            })
            .from(gameGuestProfiles)
            .where(eq(gameGuestProfiles.guestId, guestId!));
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
            .insert(gameGuestProfiles)
            .values({ guestId: guestId!, ...setting })
            .onConflictDoUpdate({ target: gameGuestProfiles.guestId, set: setting })
            .returning({
              showOnLeaderboard: gameGuestProfiles.showOnLeaderboard,
              name: gameGuestProfiles.leaderboardName,
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
      "game_leaderboard_settings_failed",
      "Failed to load or save leaderboard setting",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to update leaderboard setting" });
  }
}

export default withRequestLog(handler);

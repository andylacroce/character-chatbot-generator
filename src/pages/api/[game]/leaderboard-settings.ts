/**
 * Public leaderboard visibility setting for an account or guest browser, per game. A signed-in
 * user's opt-in name and visibility (`users.showOnLeaderboard`/`leaderboardName`) is ONE
 * field shared by both games: one account, one public leaderboard identity, consistent with
 * how this app treats a signed-in user's identity everywhere else (e.g. `preferredName`). A
 * GUEST's identity is per game instead (each game's `guestProfiles` table), since the
 * guest id is the same across both games but nothing forces the opt-in choice to be shared.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../../db/client";
import { users } from "../../../db/schema";
import { gameRoute, rejectMethod } from "../../../utils/game/route";
import { isTopTenPlayer } from "../../../utils/game/scores";
import { checkLeaderboardName } from "../../../utils/leaderboardName";
import { getGuestId } from "../../../utils/gameGuestIdentity";
import { getSessionUserId } from "../../../utils/getSessionUserId";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";

/**
 * Reads or changes this account or guest browser's public score visibility.
 *
 * @swagger
 * /{game}/leaderboard-settings:
 *   get:
 *     summary: Get this player's leaderboard visibility
 *     tags: [Game]
 *     parameters:
 *       - $ref: '#/components/parameters/Game'
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
 *     parameters:
 *       - $ref: '#/components/parameters/Game'
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
 *       404:
 *         description: Unknown game
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       503:
 *         description: Name moderation is unavailable
 *       500:
 *         description: Failed to load or save setting
 */
export default gameRoute(
  {
    endpoint: "leaderboard-settings",
    max: 5,
    message: "Too many requests from this IP, please try again later.",
  },
  async (game, req, res) => {
    if (rejectMethod(req, res, ["GET", "POST"])) return;
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
    const { guestProfiles } = game.tables;
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
                showOnLeaderboard: guestProfiles.showOnLeaderboard,
                name: guestProfiles.leaderboardName,
              })
              .from(guestProfiles)
              .where(eq(guestProfiles.guestId, guestId!));
        res.status(200).json({
          available: true,
          showOnLeaderboard: rows[0]?.showOnLeaderboard ?? false,
          eligible: await isTopTenPlayer(game, identity),
          name: rows[0]?.name ?? null,
        });
      } else {
        if (req.body.showOnLeaderboard && !(await isTopTenPlayer(game, identity))) {
          res.status(403).json({ error: "Reach the top 10 to join the leaderboard" });
          return;
        }
        const checked = req.body.showOnLeaderboard
          ? await checkLeaderboardName(req.body.name)
          : null;
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
          ? await getDb().update(users).set(setting).where(eq(users.id, userId)).returning({
              showOnLeaderboard: users.showOnLeaderboard,
              name: users.leaderboardName,
            })
          : await getDb()
              .insert(guestProfiles)
              .values({ guestId: guestId!, ...setting })
              .onConflictDoUpdate({ target: guestProfiles.guestId, set: setting })
              .returning({
                showOnLeaderboard: guestProfiles.showOnLeaderboard,
                name: guestProfiles.leaderboardName,
              });
        if (!rows[0]) {
          res.status(401).json({ error: "Account unavailable" });
          return;
        }
        res.status(200).json({
          available: true,
          showOnLeaderboard: rows[0].showOnLeaderboard,
          eligible: await isTopTenPlayer(game, identity),
          name: rows[0].name,
        });
      }
    } catch (err) {
      logEvent(
        "error",
        `${game.eventPrefix}_leaderboard_settings_failed`,
        "Failed to load or save leaderboard setting",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      res.status(500).json({ error: "Failed to update leaderboard setting" });
    }
  },
);

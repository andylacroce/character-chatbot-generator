/**
 * Public leaderboard visibility setting for an account or guest browser, per game. A signed-in
 * user's opt-in name and visibility (`users.showOnLeaderboard`/`leaderboardName`) is ONE
 * field shared by both games: one account, one public leaderboard identity, consistent with
 * how this app treats a signed-in user's identity everywhere else (e.g. `preferredName`). A
 * GUEST's identity is per game instead (each game's `guestProfiles` table), since the
 * guest id is the same across both games but nothing forces the opt-in choice to be shared.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { users } from "../../../../db/schema";
import { readJson } from "../../../../utils/server/withRoute";
import { gameRoute } from "../../../../utils/game/route";
import { isTopTenPlayer } from "../../../../utils/game/scores";
import { checkLeaderboardName } from "../../../../utils/game/leaderboardName";
import { getGuestId } from "../../../../utils/game/gameGuestIdentity";
import { getSessionUserId } from "../../../../utils/account/getSessionUserId";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";

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
 *       429:
 *         description: Rate limit exceeded
 *       503:
 *         description: Name moderation is unavailable
 *       500:
 *         description: Failed to load or save setting
 */
export const GET = gameRoute(
  {
    endpoint: "leaderboard-settings",
    max: 5,
    message: "Too many requests from this IP, please try again later.",
  },
  async (game, req) => {
    const body = await readJson(req);
    const userId = await getSessionUserId(req);
    const guestId = userId ? null : getGuestId(req);
    if ((!userId && !guestId) || !process.env.DATABASE_URL) {
      if (req.method === "GET") {
        return Response.json({
          available: false,
          showOnLeaderboard: false,
          eligible: false,
          name: null,
        });
      } else {
        return Response.json({ error: "Play a game to join the leaderboard" }, { status: 401 });
      }
    }
    if (req.method === "POST" && typeof body?.showOnLeaderboard !== "boolean") {
      return Response.json({ error: "Invalid leaderboard setting" }, { status: 400 });
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
        return Response.json({
          available: true,
          showOnLeaderboard: rows[0]?.showOnLeaderboard ?? false,
          eligible: await isTopTenPlayer(game, identity),
          name: rows[0]?.name ?? null,
        });
      } else {
        if (body.showOnLeaderboard && !(await isTopTenPlayer(game, identity))) {
          return Response.json(
            { error: "Reach the top 10 to join the leaderboard" },
            { status: 403 },
          );
        }
        const checked = body.showOnLeaderboard ? await checkLeaderboardName(body.name) : null;
        if (checked?.status === "rejected") {
          return Response.json({ error: "Choose a different display name" }, { status: 400 });
        }
        if (checked?.status === "unavailable") {
          return Response.json({ error: "Name check is temporarily unavailable" }, { status: 503 });
        }
        const setting = {
          showOnLeaderboard: body.showOnLeaderboard as boolean,
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
          return Response.json({ error: "Account unavailable" }, { status: 401 });
        }
        return Response.json({
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
      return Response.json({ error: "Failed to update leaderboard setting" }, { status: 500 });
    }
  },
);

export const POST = GET;

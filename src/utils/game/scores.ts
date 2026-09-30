/**
 * Persists a guessing game's verified scores and reads its personal bests and public,
 * opt-in leaderboard, against whichever game's tables `game.tables` names. Everything is
 * `environment`-scoped (see src/db/schema.ts), so a local/preview session can never inflate a
 * real player's production best. A no-`DATABASE_URL` deployment degrades to a no-op/null,
 * the same resilience pattern as the rest of account persistence.
 */

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { LeaderboardEntry } from "character-chatbot-shared";
import { getDb } from "../../db/client";
import { users } from "../../db/schema";
import { getCurrentEnvironment } from "../environment";
import { logEvent, sanitizeLogMeta } from "../logger";
import { mergeAndRankLeaderboard } from "../leaderboardCore";
import type { ServerGame } from "./definitions";

export type LeaderboardIdentity =
  { userId: string; guestId?: never } | { guestId: string; userId?: never };

/** Logs a failed score read/write under the game's own event prefix. */
function logScoreFailure(game: ServerGame, event: string, message: string, err: unknown) {
  logEvent(
    "error",
    `${game.eventPrefix}_${event}`,
    message,
    sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
  );
}

/** Returns the signed-in user's current personal best, or null if none exists yet (or no DB is configured). */
export async function getHighScore(game: ServerGame, userId: string): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  const { highScores } = game.tables;
  try {
    const rows = await getDb()
      .select({ highScore: highScores.highScore })
      .from(highScores)
      .where(
        and(eq(highScores.userId, userId), eq(highScores.environment, getCurrentEnvironment())),
      );
    return rows[0]?.highScore ?? null;
  } catch (err) {
    logScoreFailure(game, "high_score_get_failed", "Failed to load personal best", err);
    return null;
  }
}

/**
 * Records a new personal best if `streak` beats whatever's already stored (or nothing is
 * stored yet), a no-op otherwise. Fire-and-forget from the caller's perspective: never
 * throws, so a transient DB error never turns a player's correct guess into a failure. The
 * `setWhere` guard means a stale or racing write can never overwrite a higher score.
 */
export async function updateHighScoreIfBeaten(
  game: ServerGame,
  userId: string,
  streak: number,
): Promise<void> {
  if (!process.env.DATABASE_URL || streak <= 0) return;
  const { highScores } = game.tables;
  try {
    await getDb()
      .insert(highScores)
      .values({ userId, environment: getCurrentEnvironment(), highScore: streak })
      .onConflictDoUpdate({
        target: [highScores.userId, highScores.environment],
        set: { highScore: streak, updatedAt: new Date() },
        setWhere: sql`${highScores.highScore} < ${streak}`,
      });
  } catch (err) {
    logScoreFailure(game, "high_score_update_failed", "Failed to update personal best", err);
  }
}

/** Reads a guest browser's best recorded streak, or null if it has no scored run. */
export async function getGuestHighScore(game: ServerGame, guestId: string): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  const { results } = game.tables;
  const rows = await getDb()
    .select({ streak: sql<number>`max(${results.bestStreak})::int` })
    .from(results)
    .where(and(eq(results.environment, getCurrentEnvironment()), eq(results.guestId, guestId)));
  return rows[0]?.streak ?? null;
}

/** Records a run's best score, without allowing a delayed retry to lower it. */
export async function recordGameResult(
  game: ServerGame,
  userId: string | null,
  guestId: string | null,
  runId: string,
  streak: number,
): Promise<void> {
  if (!process.env.DATABASE_URL || streak <= 0 || Boolean(userId) === Boolean(guestId)) return;
  const { results } = game.tables;
  try {
    await getDb()
      .insert(results)
      .values({
        id: runId,
        userId,
        guestId,
        environment: getCurrentEnvironment(),
        bestStreak: streak,
      })
      .onConflictDoUpdate({
        target: results.id,
        set: { bestStreak: streak, updatedAt: new Date() },
        setWhere: sql`${results.userId} is not distinct from ${userId} and ${results.guestId} is not distinct from ${guestId} and ${results.environment} = ${getCurrentEnvironment()} and ${results.bestStreak} < ${streak}`,
      });
  } catch (err) {
    logScoreFailure(game, "result_update_failed", "Failed to save game result", err);
  }
}

/** The highest ten verified personal scores, including private scores for ranking only. */
async function getTopScores(game: ServerGame) {
  const { highScores, results } = game.tables;
  const guestBest = sql<number>`max(${results.bestStreak})::int`;
  const guestFirst = sql<Date>`min(${results.createdAt})`;
  const [accounts, guests] = await Promise.all([
    getDb()
      .select({ id: highScores.userId, streak: highScores.highScore, date: highScores.updatedAt })
      .from(highScores)
      .where(eq(highScores.environment, getCurrentEnvironment()))
      .orderBy(desc(highScores.highScore), asc(highScores.updatedAt), asc(highScores.userId))
      .limit(10),
    getDb()
      .select({ id: results.guestId, streak: guestBest, date: guestFirst })
      .from(results)
      .where(and(eq(results.environment, getCurrentEnvironment()), isNotNull(results.guestId)))
      .groupBy(results.guestId)
      .orderBy(desc(guestBest), asc(guestFirst), asc(results.guestId))
      .limit(10),
  ]);
  return mergeAndRankLeaderboard(
    accounts,
    guests.filter((score): score is typeof score & { id: string } => score.id !== null),
  );
}

/** Returns whether this account or guest browser currently owns a top-ten score. */
export async function isTopTenPlayer(
  game: ServerGame,
  identity: LeaderboardIdentity,
): Promise<boolean> {
  return (await getTopScores(game)).some(
    (score) =>
      score.id === (identity.userId ?? identity.guestId) &&
      score.kind === (identity.userId ? "user" : "guest"),
  );
}

/** Returns only public names and scores occupying an overall top-ten position. */
export async function getLeaderboard(game: ServerGame): Promise<LeaderboardEntry[]> {
  const scores = await getTopScores(game);
  if (scores.length === 0) return [];
  const { guestProfiles } = game.tables;
  const userIds = scores.filter((score) => score.kind === "user").map((score) => score.id);
  const guestIds = scores.filter((score) => score.kind === "guest").map((score) => score.id);
  const [publicPlayers, publicGuests] = await Promise.all([
    userIds.length
      ? getDb()
          .select({ id: users.id, name: users.leaderboardName })
          .from(users)
          .where(and(inArray(users.id, userIds), eq(users.showOnLeaderboard, true)))
      : Promise.resolve([]),
    guestIds.length
      ? getDb()
          .select({ id: guestProfiles.guestId, name: guestProfiles.leaderboardName })
          .from(guestProfiles)
          .where(
            and(
              inArray(guestProfiles.guestId, guestIds),
              eq(guestProfiles.showOnLeaderboard, true),
            ),
          )
      : Promise.resolve([]),
  ]);
  const publicUserNames = new Map(publicPlayers.map((player) => [player.id, player.name]));
  const publicGuestNames = new Map(publicGuests.map((player) => [player.id, player.name]));
  return scores.flatMap((score, index) => {
    const name =
      score.kind === "user" ? publicUserNames.get(score.id) : publicGuestNames.get(score.id);
    return name ? [{ rank: index + 1, name, streak: score.streak }] : [];
  });
}

/** Persists verified game scores and reads the public, opt-in leaderboard. */

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { gameGuestProfiles, gameHighScores, gameResults, users } from "../db/schema";
import { getCurrentEnvironment } from "./environment";
import { logEvent, sanitizeLogMeta } from "./logger";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  streak: number;
}

export type LeaderboardIdentity =
  { userId: string; guestId?: never } | { guestId: string; userId?: never };

/** A single verified run that a player may lock a public name to. */
export interface ClaimableRun {
  id: string;
  bestStreak: number;
  leaderboardName: string | null;
}

/** Returns the requested run when owned by this identity in this environment, else null. */
export async function getClaimableRun(
  identity: LeaderboardIdentity,
  runId: string,
): Promise<ClaimableRun | null> {
  if (!process.env.DATABASE_URL || typeof runId !== "string" || runId.length === 0) return null;
  const owner =
    identity.userId !== undefined
      ? eq(gameResults.userId, identity.userId)
      : eq(gameResults.guestId, identity.guestId);
  const rows = await getDb()
    .select({
      id: gameResults.id,
      bestStreak: gameResults.bestStreak,
      leaderboardName: gameResults.leaderboardName,
    })
    .from(gameResults)
    .where(
      and(eq(gameResults.id, runId), eq(gameResults.environment, getCurrentEnvironment()), owner),
    );
  const row = rows[0];
  return row
    ? { id: row.id, bestStreak: row.bestStreak, leaderboardName: row.leaderboardName ?? null }
    : null;
}

/** The highest ten verified personal scores, including private scores for ranking only. */
async function getTopScores() {
  const guestBest = sql<number>`max(${gameResults.bestStreak})::int`;
  const guestFirst = sql<Date>`min(${gameResults.createdAt})`;
  const [accounts, guests] = await Promise.all([
    getDb()
      .select({
        id: gameHighScores.userId,
        streak: gameHighScores.highScore,
        date: gameHighScores.updatedAt,
      })
      .from(gameHighScores)
      .where(eq(gameHighScores.environment, getCurrentEnvironment()))
      .orderBy(
        desc(gameHighScores.highScore),
        asc(gameHighScores.updatedAt),
        asc(gameHighScores.userId),
      )
      .limit(10),
    getDb()
      .select({ id: gameResults.guestId, streak: guestBest, date: guestFirst })
      .from(gameResults)
      .where(
        and(eq(gameResults.environment, getCurrentEnvironment()), isNotNull(gameResults.guestId)),
      )
      .groupBy(gameResults.guestId)
      .orderBy(desc(guestBest), asc(guestFirst), asc(gameResults.guestId))
      .limit(10),
  ]);
  return [
    ...accounts.map((score) => ({ ...score, kind: "user" as const })),
    ...guests
      .filter((score): score is typeof score & { id: string } => score.id !== null)
      .map((score) => ({ ...score, kind: "guest" as const })),
  ]
    .sort(
      (a, b) =>
        b.streak - a.streak ||
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 10);
}

/** Returns whether this account or guest browser currently owns a top-ten score. */
export async function isTopTenPlayer(identity: LeaderboardIdentity): Promise<boolean> {
  return (await getTopScores()).some(
    (score) =>
      score.id === (identity.userId ?? identity.guestId) &&
      score.kind === (identity.userId ? "user" : "guest"),
  );
}

/** Reads a guest browser's best recorded streak, or null if it has no scored run. */
export async function getGuestHighScore(guestId: string): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  const rows = await getDb()
    .select({ streak: sql<number>`max(${gameResults.bestStreak})::int` })
    .from(gameResults)
    .where(
      and(eq(gameResults.environment, getCurrentEnvironment()), eq(gameResults.guestId, guestId)),
    );
  return rows[0]?.streak ?? null;
}

/** Records a run's best score, without allowing a delayed retry to lower it. */
export async function recordGameResult(
  userId: string | null,
  guestId: string | null,
  runId: string,
  streak: number,
): Promise<void> {
  if (!process.env.DATABASE_URL || streak <= 0 || Boolean(userId) === Boolean(guestId)) return;
  try {
    await getDb()
      .insert(gameResults)
      .values({
        id: runId,
        userId,
        guestId,
        environment: getCurrentEnvironment(),
        bestStreak: streak,
      })
      .onConflictDoUpdate({
        target: gameResults.id,
        set: { bestStreak: streak, updatedAt: new Date() },
        setWhere: sql`${gameResults.userId} is not distinct from ${userId} and ${gameResults.guestId} is not distinct from ${guestId} and ${gameResults.environment} = ${getCurrentEnvironment()} and ${gameResults.bestStreak} < ${streak}`,
      });
  } catch (err) {
    logEvent(
      "error",
      "game_result_update_failed",
      "Failed to save game result",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

/** Returns only public names and scores occupying an overall top-ten position. */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const scores = await getTopScores();
  if (scores.length === 0) return [];
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
          .select({ id: gameGuestProfiles.guestId, name: gameGuestProfiles.leaderboardName })
          .from(gameGuestProfiles)
          .where(
            and(
              inArray(gameGuestProfiles.guestId, guestIds),
              eq(gameGuestProfiles.showOnLeaderboard, true),
            ),
          )
      : Promise.resolve([]),
  ]);
  const publicUserNames = new Map(publicPlayers.map((player) => [player.id, player.name]));
  const publicGuestNames = new Map(publicGuests.map((player) => [player.id, player.name]));
  return scores.flatMap((score, index) => {
    const profileName =
      score.kind === "user" ? publicUserNames.get(score.id) : publicGuestNames.get(score.id);
    const name = profileName;
    return name ? [{ rank: index + 1, name, streak: score.streak }] : [];
  });
}

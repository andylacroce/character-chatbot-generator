/** Persists verified game scores and reads the public, opt-in leaderboard. */

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  guessWhoNextGuestProfiles,
  guessWhoNextHighScores,
  guessWhoNextResults,
  users,
} from "../db/schema";
import { getCurrentEnvironment } from "./environment";
import { logEvent, sanitizeLogMeta } from "./logger";
import { mergeAndRankLeaderboard } from "./leaderboardCore";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  streak: number;
}

export type LeaderboardIdentity =
  { userId: string; guestId?: never } | { guestId: string; userId?: never };

/** The highest ten verified personal scores, including private scores for ranking only. */
async function getTopScores() {
  const guestBest = sql<number>`max(${guessWhoNextResults.bestStreak})::int`;
  const guestFirst = sql<Date>`min(${guessWhoNextResults.createdAt})`;
  const [accounts, guests] = await Promise.all([
    getDb()
      .select({
        id: guessWhoNextHighScores.userId,
        streak: guessWhoNextHighScores.highScore,
        date: guessWhoNextHighScores.updatedAt,
      })
      .from(guessWhoNextHighScores)
      .where(eq(guessWhoNextHighScores.environment, getCurrentEnvironment()))
      .orderBy(
        desc(guessWhoNextHighScores.highScore),
        asc(guessWhoNextHighScores.updatedAt),
        asc(guessWhoNextHighScores.userId),
      )
      .limit(10),
    getDb()
      .select({ id: guessWhoNextResults.guestId, streak: guestBest, date: guestFirst })
      .from(guessWhoNextResults)
      .where(
        and(
          eq(guessWhoNextResults.environment, getCurrentEnvironment()),
          isNotNull(guessWhoNextResults.guestId),
        ),
      )
      .groupBy(guessWhoNextResults.guestId)
      .orderBy(desc(guestBest), asc(guestFirst), asc(guessWhoNextResults.guestId))
      .limit(10),
  ]);
  return mergeAndRankLeaderboard(
    accounts,
    guests.filter((score): score is typeof score & { id: string } => score.id !== null),
  );
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
    .select({ streak: sql<number>`max(${guessWhoNextResults.bestStreak})::int` })
    .from(guessWhoNextResults)
    .where(
      and(
        eq(guessWhoNextResults.environment, getCurrentEnvironment()),
        eq(guessWhoNextResults.guestId, guestId),
      ),
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
      .insert(guessWhoNextResults)
      .values({
        id: runId,
        userId,
        guestId,
        environment: getCurrentEnvironment(),
        bestStreak: streak,
      })
      .onConflictDoUpdate({
        target: guessWhoNextResults.id,
        set: { bestStreak: streak, updatedAt: new Date() },
        setWhere: sql`${guessWhoNextResults.userId} is not distinct from ${userId} and ${guessWhoNextResults.guestId} is not distinct from ${guestId} and ${guessWhoNextResults.environment} = ${getCurrentEnvironment()} and ${guessWhoNextResults.bestStreak} < ${streak}`,
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
          .select({
            id: guessWhoNextGuestProfiles.guestId,
            name: guessWhoNextGuestProfiles.leaderboardName,
          })
          .from(guessWhoNextGuestProfiles)
          .where(
            and(
              inArray(guessWhoNextGuestProfiles.guestId, guestIds),
              eq(guessWhoNextGuestProfiles.showOnLeaderboard, true),
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

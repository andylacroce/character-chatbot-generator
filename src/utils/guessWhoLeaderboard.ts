/** Persists verified "Guess Who" scores and reads the public, opt-in leaderboard — mirrors guessWhoNextLeaderboard.ts against the separate guessWhoResults/guessWhoHighScores/guessWhoGuestProfiles tables. */

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { guessWhoGuestProfiles, guessWhoHighScores, guessWhoResults, users } from "../db/schema";
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
  const guestBest = sql<number>`max(${guessWhoResults.bestStreak})::int`;
  const guestFirst = sql<Date>`min(${guessWhoResults.createdAt})`;
  const [accounts, guests] = await Promise.all([
    getDb()
      .select({
        id: guessWhoHighScores.userId,
        streak: guessWhoHighScores.highScore,
        date: guessWhoHighScores.updatedAt,
      })
      .from(guessWhoHighScores)
      .where(eq(guessWhoHighScores.environment, getCurrentEnvironment()))
      .orderBy(
        desc(guessWhoHighScores.highScore),
        asc(guessWhoHighScores.updatedAt),
        asc(guessWhoHighScores.userId),
      )
      .limit(10),
    getDb()
      .select({ id: guessWhoResults.guestId, streak: guestBest, date: guestFirst })
      .from(guessWhoResults)
      .where(
        and(
          eq(guessWhoResults.environment, getCurrentEnvironment()),
          isNotNull(guessWhoResults.guestId),
        ),
      )
      .groupBy(guessWhoResults.guestId)
      .orderBy(desc(guestBest), asc(guestFirst), asc(guessWhoResults.guestId))
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
    .select({ streak: sql<number>`max(${guessWhoResults.bestStreak})::int` })
    .from(guessWhoResults)
    .where(
      and(
        eq(guessWhoResults.environment, getCurrentEnvironment()),
        eq(guessWhoResults.guestId, guestId),
      ),
    );
  return rows[0]?.streak ?? null;
}

/** Records a run's best score, without allowing a delayed retry to lower it. */
export async function recordGuessWhoResult(
  userId: string | null,
  guestId: string | null,
  runId: string,
  streak: number,
): Promise<void> {
  if (!process.env.DATABASE_URL || streak <= 0 || Boolean(userId) === Boolean(guestId)) return;
  try {
    await getDb()
      .insert(guessWhoResults)
      .values({
        id: runId,
        userId,
        guestId,
        environment: getCurrentEnvironment(),
        bestStreak: streak,
      })
      .onConflictDoUpdate({
        target: guessWhoResults.id,
        set: { bestStreak: streak, updatedAt: new Date() },
        setWhere: sql`${guessWhoResults.userId} is not distinct from ${userId} and ${guessWhoResults.guestId} is not distinct from ${guestId} and ${guessWhoResults.environment} = ${getCurrentEnvironment()} and ${guessWhoResults.bestStreak} < ${streak}`,
      });
  } catch (err) {
    logEvent(
      "error",
      "guess_who_result_update_failed",
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
            id: guessWhoGuestProfiles.guestId,
            name: guessWhoGuestProfiles.leaderboardName,
          })
          .from(guessWhoGuestProfiles)
          .where(
            and(
              inArray(guessWhoGuestProfiles.guestId, guestIds),
              eq(guessWhoGuestProfiles.showOnLeaderboard, true),
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

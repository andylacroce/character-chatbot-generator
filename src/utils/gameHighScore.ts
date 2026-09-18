/**
 * Reads and updates a signed-in user's personal best guessing-game streak — see
 * src/db/schema.ts's `gameHighScores` doc comment for the table shape and why it's
 * environment-scoped. Guests and deployments with no DATABASE_URL degrade to a no-op/
 * null, same resilience pattern as the rest of account persistence (bots, avatar cache,
 * analytics).
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { gameHighScores } from "../db/schema";
import { getCurrentEnvironment } from "./environment";
import { logEvent, sanitizeLogMeta } from "./logger";

/** Returns the signed-in user's current personal best, or null if none exists yet (or no DB is configured). */
export async function getHighScore(userId: string): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await getDb()
      .select({ highScore: gameHighScores.highScore })
      .from(gameHighScores)
      .where(
        and(
          eq(gameHighScores.userId, userId),
          eq(gameHighScores.environment, getCurrentEnvironment()),
        ),
      );
    return rows[0]?.highScore ?? null;
  } catch (err) {
    logEvent(
      "error",
      "game_high_score_get_failed",
      "Failed to load personal best",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return null;
  }
}

/**
 * Records a new personal best if `streak` beats whatever's already stored (or nothing is
 * stored yet), a no-op otherwise. Fire-and-forget from the caller's perspective — never
 * throws, so a transient DB error never turns a player's correct guess into a failure.
 */
export async function updateHighScoreIfBeaten(userId: string, streak: number): Promise<void> {
  if (!process.env.DATABASE_URL || streak <= 0) return;
  try {
    const environment = getCurrentEnvironment();
    await getDb()
      .insert(gameHighScores)
      .values({ userId, environment, highScore: streak })
      .onConflictDoUpdate({
        target: [gameHighScores.userId, gameHighScores.environment],
        set: { highScore: streak, updatedAt: new Date() },
        setWhere: sql`${gameHighScores.highScore} < ${streak}`,
      });
  } catch (err) {
    logEvent(
      "error",
      "game_high_score_update_failed",
      "Failed to update personal best",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

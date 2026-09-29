/**
 * Reads and updates a signed-in user's personal best "Guess Who" streak — mirrors
 * guessWhoNextHighScore.ts exactly, against the separate `guessWhoHighScores` table (see
 * db/schema.ts's doc comment for why the two games keep wholly separate score tables).
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { guessWhoHighScores } from "../db/schema";
import { getCurrentEnvironment } from "./environment";
import { logEvent, sanitizeLogMeta } from "./logger";

/** Returns the signed-in user's current personal best, or null if none exists yet (or no DB is configured). */
export async function getHighScore(userId: string): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await getDb()
      .select({ highScore: guessWhoHighScores.highScore })
      .from(guessWhoHighScores)
      .where(
        and(
          eq(guessWhoHighScores.userId, userId),
          eq(guessWhoHighScores.environment, getCurrentEnvironment()),
        ),
      );
    return rows[0]?.highScore ?? null;
  } catch (err) {
    logEvent(
      "error",
      "guess_who_high_score_get_failed",
      "Failed to load personal best",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return null;
  }
}

/**
 * Records a new personal best if `streak` beats whatever's already stored, a no-op
 * otherwise. Fire-and-forget from the caller's perspective — never throws.
 */
export async function updateHighScoreIfBeaten(userId: string, streak: number): Promise<void> {
  if (!process.env.DATABASE_URL || streak <= 0) return;
  try {
    const environment = getCurrentEnvironment();
    await getDb()
      .insert(guessWhoHighScores)
      .values({ userId, environment, highScore: streak })
      .onConflictDoUpdate({
        target: [guessWhoHighScores.userId, guessWhoHighScores.environment],
        set: { highScore: streak, updatedAt: new Date() },
        setWhere: sql`${guessWhoHighScores.highScore} < ${streak}`,
      });
  } catch (err) {
    logEvent(
      "error",
      "guess_who_high_score_update_failed",
      "Failed to update personal best",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

/**
 * Pure, platform-agnostic "Guess Who" (the clue-reveal game) logic shared by the web
 * app's and the mobile app's game hooks. Mirrors guessWhoNext.ts's role for the
 * chat-steering game, but the state shape here is a clue list + a reveal index rather
 * than a message transcript — genuinely different enough from the chat game's model
 * that sharing one generic hook across both would add more abstraction than it saves
 * (see CLAUDE.md's "Second game mode" plan).
 */

import type { GuessWhoGuessResponse, GuessWhoRoundResult } from "./types";

/** A transient result banner shown after a guess is judged. */
export type GuessWhoEvent =
  | {
      type: "correct";
      revealedName: string;
      avatarUrl: string;
      gender: string | null;
      streak: number;
    }
  | { type: "wrong"; clue: string; clueNumber: number; totalClues: number }
  | {
      type: "gameover";
      revealedName: string;
      avatarUrl: string;
      gender: string | null;
      finalStreak: number;
    };

/** Everything persisted between visits so an in-progress run resumes where it left off. */
export interface PersistedGuessWhoState {
  /** Opaque, server-encrypted round token. Never decoded client-side. Absent once a round has ended and Continue hasn't been clicked yet. */
  guessWhoToken: string | null;
  clue: string;
  clueNumber: number;
  totalClues: number;
  streak: number;
  usedNames: string[];
  /** Persisted so a correct-guess/game-over banner survives a reload. */
  lastEvent: GuessWhoEvent | null;
}

/** Placeholder avatar for a character with no portrait yet (never shown during the clue phase — only at reveal). */
export const GUESS_WHO_FALLBACK_AVATAR = "/silhouette.svg";

/** Validates a /guess-who/start result and fills in defaults. Throws on a server error or a malformed payload. */
export function parseGuessWhoRoundResult(raw: unknown, source: string): GuessWhoRoundResult {
  const result = (raw ?? {}) as Record<string, unknown>;
  if (typeof result.error === "string") throw new Error(result.error);
  if (
    typeof result.guessWhoToken !== "string" ||
    typeof result.clue !== "string" ||
    typeof result.clueNumber !== "number" ||
    typeof result.totalClues !== "number"
  ) {
    throw new Error(`Invalid response from ${source}`);
  }
  return {
    guessWhoToken: result.guessWhoToken,
    clue: result.clue,
    clueNumber: result.clueNumber,
    totalClues: result.totalClues,
    streak: (result.streak as number) ?? 0,
  };
}

/** What one /guess-who/guess response means for client state. */
export interface GuessWhoTurnOutcome {
  event: GuessWhoEvent;
  /** `undefined` leaves the token as is; `null` ends/pauses the round; a string replaces it. */
  guessWhoToken?: string | null;
  streak: number;
  usedNames?: string[];
  /** Set on a correct guess, so the caller can raise the personal best. */
  newStreak?: number;
}

/** Interprets a /guess-who/guess response. Throws on a malformed response. */
export function applyGuessWhoResponse(data: GuessWhoGuessResponse): GuessWhoTurnOutcome {
  if (data.correct) {
    if (!data.revealedName) throw new Error("Invalid response from /api/guess-who/guess");
    return {
      event: {
        type: "correct",
        revealedName: data.revealedName,
        avatarUrl: data.avatarUrl || GUESS_WHO_FALLBACK_AVATAR,
        gender: data.gender ?? null,
        streak: data.streak,
      },
      guessWhoToken: null,
      streak: data.streak,
      usedNames: data.usedNames,
      newStreak: data.streak,
    };
  }
  if (data.gameOver) {
    if (!data.revealedName) throw new Error("Invalid response from /api/guess-who/guess");
    return {
      event: {
        type: "gameover",
        revealedName: data.revealedName,
        avatarUrl: data.avatarUrl || GUESS_WHO_FALLBACK_AVATAR,
        gender: data.gender ?? null,
        finalStreak: data.streak,
      },
      guessWhoToken: null,
      streak: 0,
      usedNames: data.usedNames,
    };
  }
  if (typeof data.clue !== "string" || typeof data.clueNumber !== "number") {
    throw new Error("Invalid response from /api/guess-who/guess");
  }
  return {
    event: {
      type: "wrong",
      clue: data.clue,
      clueNumber: data.clueNumber,
      totalClues: data.totalClues ?? data.clueNumber,
    },
    guessWhoToken: typeof data.guessWhoToken === "string" ? data.guessWhoToken : undefined,
    streak: data.streak,
  };
}

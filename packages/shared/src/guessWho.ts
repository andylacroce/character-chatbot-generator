/**
 * Pure, platform-agnostic "Guess Who" (the self-describing chat game) logic shared by
 * the web app's and the mobile app's game hooks. Mirrors guessWhoNext.ts's shape closely
 * (a real chat, one shared input box for both ordinary messages and guesses) with one
 * structural difference: there's only ONE identity per round, and it stays hidden — the
 * character being chatted with IS the mystery, so its name/avatar never appear in an
 * ordinary reply, only in a reveal (`GuessWhoEvent`'s "correct"/"gameover" variants).
 */

import type { GuessWhoMessageResponse, GuessWhoRoundResult } from "./types";

/** A transient result banner shown after a guess is judged. */
export type GuessWhoEvent =
  | {
      type: "correct";
      revealedName: string;
      avatarUrl: string;
      gender: string | null;
      streak: number;
    }
  | { type: "wrong"; wrongGuessesRemaining: number }
  | {
      type: "gameover";
      revealedName: string;
      avatarUrl: string;
      gender: string | null;
      finalStreak: number;
    };

/** One transcript entry. The mystery character always uses GUESS_WHO_MYSTERY_NAME as its sender label. */
export interface GuessWhoMessage {
  sender: string;
  text: string;
  audioFileUrl?: string;
}

/** Placeholder avatar shown while the round's identity is still hidden, or as a reveal fallback. */
export const GUESS_WHO_FALLBACK_AVATAR = "/silhouette.svg";

/** Sender label used for the hidden character's messages while its identity is unknown. */
export const GUESS_WHO_MYSTERY_NAME = "???";

/** Everything persisted between visits so an in-progress run resumes where it left off. */
export interface PersistedGuessWhoState {
  /** Opaque, server-encrypted round token. Never decoded client-side. */
  guessWhoToken: string;
  streak: number;
  messages: GuessWhoMessage[];
  /** Index into `messages` where the CURRENT round begins; only that slice is sent as history. */
  roundStartIndex: number;
  /** Persisted so the "Correct!"/Continue banner survives a reload. */
  lastEvent: GuessWhoEvent | null;
}

/** Builds the "User: "/"Bot: "-prefixed history lines /guess-who/message expects. */
export function toGuessWhoConversationHistory(messages: GuessWhoMessage[]): string[] {
  return messages.map((m) => (m.sender === "User" ? `User: ${m.text}` : `Bot: ${m.text}`));
}

/**
 * Validates a /guess-who/start or /guess-who/continue result (JSON body, or the web's
 * final SSE frame) and fills in defaults. Throws on a server error or a malformed payload.
 */
export function parseGuessWhoRoundResult(raw: unknown, source: string): GuessWhoRoundResult {
  const result = (raw ?? {}) as Record<string, unknown>;
  if (typeof result.error === "string") throw new Error(result.error);
  if (typeof result.guessWhoToken !== "string" || typeof result.reply !== "string") {
    throw new Error(`Invalid response from ${source}`);
  }
  return {
    guessWhoToken: result.guessWhoToken,
    reply: result.reply,
    audioFileUrl: result.audioFileUrl as string | undefined,
    streak: (result.streak as number) ?? 0,
  };
}

/** The opening transcript entry for a freshly generated round, sender withheld. */
export function guessWhoRoundGreeting(round: GuessWhoRoundResult): GuessWhoMessage {
  return { sender: GUESS_WHO_MYSTERY_NAME, text: round.reply, audioFileUrl: round.audioFileUrl };
}

/** What one /guess-who/message response means for client state. */
export interface GuessWhoTurnOutcome {
  /** The player asked to give up in chat: show the confirmation, append nothing. */
  giveUpRequested: boolean;
  /** The mystery character's reply to append, or null (give-up requests have none). */
  reply: GuessWhoMessage | null;
  lastEvent: GuessWhoEvent | null;
  /** `undefined` leaves the token as is; `null` ends the run; a string replaces it. */
  guessWhoToken?: string | null;
  /** Set on a correct guess, so the caller can raise the personal best. */
  newStreak?: number;
}

/** Interprets a /guess-who/message response. Throws on a malformed response. */
export function applyGuessWhoMessageResponse(data: GuessWhoMessageResponse): GuessWhoTurnOutcome {
  if (data.giveUpRequested) {
    return { giveUpRequested: true, reply: null, lastEvent: null };
  }
  if (typeof data.reply !== "string" || !data.reply) {
    throw new Error("Invalid response from /api/guess-who/message");
  }
  const reply: GuessWhoMessage = {
    sender: GUESS_WHO_MYSTERY_NAME,
    text: data.reply,
    audioFileUrl: data.audioFileUrl,
  };

  if (data.correct) {
    if (!data.revealedName) throw new Error("Invalid response from /api/guess-who/message");
    return {
      giveUpRequested: false,
      reply,
      lastEvent: {
        type: "correct",
        revealedName: data.revealedName,
        avatarUrl: data.avatarUrl || GUESS_WHO_FALLBACK_AVATAR,
        gender: data.gender ?? null,
        streak: data.streak ?? 0,
      },
      guessWhoToken: typeof data.guessWhoToken === "string" ? data.guessWhoToken : undefined,
      newStreak: typeof data.streak === "number" ? data.streak : undefined,
    };
  }
  if (data.gameOver) {
    if (!data.revealedName) throw new Error("Invalid response from /api/guess-who/message");
    return {
      giveUpRequested: false,
      reply,
      lastEvent: {
        type: "gameover",
        revealedName: data.revealedName,
        avatarUrl: data.avatarUrl || GUESS_WHO_FALLBACK_AVATAR,
        gender: data.gender ?? null,
        finalStreak: data.finalStreak ?? 0,
      },
      guessWhoToken: null,
    };
  }
  if (data.wrongGuessesRemaining !== undefined) {
    return {
      giveUpRequested: false,
      reply,
      lastEvent: { type: "wrong", wrongGuessesRemaining: data.wrongGuessesRemaining },
      guessWhoToken: typeof data.guessWhoToken === "string" ? data.guessWhoToken : undefined,
    };
  }
  return { giveUpRequested: false, reply, lastEvent: null };
}

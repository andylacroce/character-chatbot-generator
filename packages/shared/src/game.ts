/**
 * Pure, platform-agnostic guessing-game logic shared by the web app's and the mobile app's
 * game hooks (both built on useGameSession.ts). Everything here is plain data in, plain data
 * out, so the rules for interpreting a server response live in exactly one place.
 */

import type { GameMessageResponse, GameRoundResult } from "./types";

/** A transient result banner shown after a guess is judged. */
export type GameEvent =
  | { type: "correct"; revealedName: string; streak: number }
  | { type: "wrong"; wrongGuessesRemaining: number }
  | { type: "gameover"; revealedName: string; finalStreak: number };

/**
 * One transcript entry. `avatarUrl` pins the speaker's portrait at the time it was said,
 * since the current character changes mid-transcript on every round switch.
 */
export interface GameMessage {
  sender: string;
  text: string;
  audioFileUrl?: string;
  avatarUrl?: string;
}

/** Everything persisted between visits so an in-progress run resumes where it left off. */
export interface PersistedGameState {
  /** Opaque, server-encrypted round token. Never decoded client-side. */
  gameToken: string;
  currentCharacterName: string;
  avatarUrl: string;
  gender: string | null;
  streak: number;
  messages: GameMessage[];
  /** Index into `messages` where the CURRENT round begins; only that slice is sent as history. */
  roundStartIndex: number;
  /** Persisted so the "Correct!"/Continue banner survives a reload. */
  lastEvent: GameEvent | null;
}

/** Placeholder avatar for a character with no portrait. */
export const GAME_FALLBACK_AVATAR = "/silhouette.svg";

/** Builds the "User: "/"Bot: "-prefixed history lines /game/message expects. */
export function toGameConversationHistory(messages: GameMessage[]): string[] {
  return messages.map((m) => (m.sender === "User" ? `User: ${m.text}` : `Bot: ${m.text}`));
}

/** Substitutes `{key}` placeholders in shared copy (see gameCopy.ts). */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Validates a /game/start or /game/continue result (JSON body, or the web's final SSE
 * frame) and fills in defaults. Throws on a server error or a malformed payload.
 */
export function parseGameRoundResult(raw: unknown, source: string): GameRoundResult {
  const result = (raw ?? {}) as Record<string, unknown>;
  if (typeof result.error === "string") throw new Error(result.error);
  if (
    typeof result.gameToken !== "string" ||
    typeof result.reply !== "string" ||
    typeof result.currentCharacterName !== "string"
  ) {
    throw new Error(`Invalid response from ${source}`);
  }
  return {
    gameToken: result.gameToken,
    currentCharacterName: result.currentCharacterName,
    avatarUrl: (result.avatarUrl as string) || GAME_FALLBACK_AVATAR,
    gender: (result.gender as string | null) ?? null,
    reply: result.reply,
    audioFileUrl: result.audioFileUrl as string | undefined,
    streak: (result.streak as number) ?? 0,
  };
}

/** The opening transcript entry for a freshly generated round. */
export function roundGreeting(round: GameRoundResult): GameMessage {
  return {
    sender: round.currentCharacterName,
    text: round.reply,
    audioFileUrl: round.audioFileUrl,
    avatarUrl: round.avatarUrl,
  };
}

/** What one /game/message response means for client state. */
export interface GameTurnOutcome {
  /** The player asked to give up in chat: show the confirmation, append nothing. */
  giveUpRequested: boolean;
  /** The current character's reply to append, or null (give-up requests have none). */
  reply: GameMessage | null;
  lastEvent: GameEvent | null;
  /** `undefined` leaves the token as is; `null` ends the run; a string replaces it. */
  gameToken?: string | null;
  /** Set on a correct guess, so the caller can raise the personal best. */
  newStreak?: number;
}

/**
 * Interprets a /game/message response. `speaker` is the character who was current when
 * the message was sent; every reply this turn is theirs, even on a correct guess (the next
 * character isn't generated until the player continues). Throws on a malformed response.
 */
export function applyGameMessageResponse(
  data: GameMessageResponse,
  speaker: { name: string; avatarUrl: string },
): GameTurnOutcome {
  if (data.giveUpRequested) {
    return { giveUpRequested: true, reply: null, lastEvent: null };
  }
  if (typeof data.reply !== "string" || !data.reply) {
    throw new Error("Invalid response from /api/game/message");
  }
  const reply: GameMessage = {
    sender: speaker.name,
    text: data.reply,
    audioFileUrl: data.audioFileUrl,
    avatarUrl: speaker.avatarUrl,
  };

  if (data.correct) {
    return {
      giveUpRequested: false,
      reply,
      lastEvent: {
        type: "correct",
        revealedName: data.revealedName ?? "",
        streak: data.streak ?? 0,
      },
      gameToken: typeof data.gameToken === "string" ? data.gameToken : undefined,
      newStreak: typeof data.streak === "number" ? data.streak : undefined,
    };
  }
  if (data.gameOver) {
    return {
      giveUpRequested: false,
      reply,
      lastEvent: {
        type: "gameover",
        revealedName: data.revealedName ?? "",
        finalStreak: data.finalStreak ?? 0,
      },
      gameToken: null,
    };
  }
  if (data.wrongGuessesRemaining !== undefined) {
    return {
      giveUpRequested: false,
      reply,
      lastEvent: { type: "wrong", wrongGuessesRemaining: data.wrongGuessesRemaining },
      gameToken: typeof data.gameToken === "string" ? data.gameToken : undefined,
    };
  }
  return { giveUpRequested: false, reply, lastEvent: null };
}

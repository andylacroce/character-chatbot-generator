/**
 * The guessing games' client state as plain data: transcript and persisted-run shapes, and the
 * pure functions that turn a server response into the next state.
 */

import type {
  GameGiveUpResponse,
  GameMessageResponse,
  GameRoundResult,
  GameSpeaker,
} from "./types";
import { GameDefinition, GAME_FALLBACK_AVATAR, GAME_MYSTERY_NAME } from "./gameDefinitions";

/** A transient result banner shown after a guess is judged. */
export type GameEvent =
  | {
      type: "correct";
      revealedName: string;
      /** Only present when the speaker was the mystery (`GameDefinition.hidesSpeaker`). */
      avatarUrl?: string;
      gender?: string | null;
      streak: number;
    }
  | { type: "wrong"; wrongGuessesRemaining: number }
  | {
      type: "gameover";
      revealedName: string;
      avatarUrl?: string;
      gender?: string | null;
      finalStreak: number;
    };

/**
 * One transcript entry. `avatarUrl` pins the speaker's portrait at the time it was said,
 * since the speaker changes mid-transcript on every round switch (and, in a hidden-speaker
 * game, from the mystery placeholder to the real identity on a reveal).
 */
export interface GameMessage {
  sender: string;
  text: string;
  audioFileUrl?: string;
  avatarUrl?: string;
  /** Pins replay voice selection to the speaker's round after another character takes over. */
  gender?: string | null;
}

/**
 * Everything persisted between visits so an in-progress run resumes where it left off.
 * `currentCharacterName`/`avatarUrl`/`gender` exist only for a game that shows its speaker;
 * they are optional so a run stored by either game's earlier builds still loads.
 */
export interface PersistedGameState {
  /** Opaque, server-encrypted round token. Never decoded client-side. */
  token: string;
  currentCharacterName?: string;
  avatarUrl?: string;
  gender?: string | null;
  streak: number;
  messages: GameMessage[];
  /** Index into `messages` where the CURRENT round begins; only that slice is sent as history. */
  roundStartIndex: number;
  /** Persisted so the "Correct!"/Continue banner survives a reload. */
  lastEvent: GameEvent | null;
}

/** Builds the "User: "/"Bot: "-prefixed history lines the message endpoint expects. */
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
 * Validates a start/continue result (JSON body, or the web's final SSE frame), reading the
 * token under the game's own wire name, and fills in defaults. Throws on a server error
 * or a malformed payload.
 */
export function parseGameRoundResult(
  game: GameDefinition,
  raw: unknown,
  source: string,
): GameRoundResult {
  const result = (raw ?? {}) as Record<string, unknown>;
  if (typeof result.error === "string") throw new Error(result.error);
  const token = result[game.tokenField];
  if (
    typeof token !== "string" ||
    typeof result.reply !== "string" ||
    (!game.hidesSpeaker && typeof result.currentCharacterName !== "string")
  ) {
    throw new Error(`Invalid response from ${source}`);
  }
  return {
    token,
    speaker: game.hidesSpeaker
      ? null
      : {
          name: result.currentCharacterName as string,
          avatarUrl: (result.avatarUrl as string) || GAME_FALLBACK_AVATAR,
          gender: (result.gender as string | null) ?? null,
        },
    reply: result.reply,
    audioFileUrl: result.audioFileUrl as string | undefined,
    streak: (result.streak as number) ?? 0,
  };
}

/** Normalizes a message response's wire token name to `token`. */
export function parseGameMessageResponse(game: GameDefinition, raw: unknown): GameMessageResponse {
  const { [game.tokenField]: token, ...rest } = (raw ?? {}) as Record<string, unknown>;
  return { ...(rest as GameMessageResponse), token: typeof token === "string" ? token : undefined };
}

/** The opening transcript entry for a freshly generated round. */
export function gameRoundGreeting(game: GameDefinition, round: GameRoundResult): GameMessage {
  if (game.hidesSpeaker || !round.speaker) {
    return { sender: GAME_MYSTERY_NAME, text: round.reply, audioFileUrl: round.audioFileUrl };
  }
  return {
    sender: round.speaker.name,
    text: round.reply,
    audioFileUrl: round.audioFileUrl,
    avatarUrl: round.speaker.avatarUrl,
    gender: round.speaker.gender,
  };
}

/** The identity a correct guess or game-over reveals, or null for any other event. */
export function revealedSpeaker(event: GameEvent | null): GameSpeaker | null {
  if (event?.type !== "correct" && event?.type !== "gameover") return null;
  return {
    name: event.revealedName,
    avatarUrl: event.avatarUrl ?? GAME_FALLBACK_AVATAR,
    gender: event.gender ?? null,
  };
}

/**
 * Retroactively reveals a hidden-speaker round's messages once the mystery is identified:
 * replaces every message from `fromIndex` onward whose sender is still the mystery
 * placeholder with the real name/avatar/gender, so a correct guess or game-over updates
 * the whole transcript, not just future messages.
 */
export function revealGameMessages(
  messages: GameMessage[],
  fromIndex: number,
  speaker: GameSpeaker,
): GameMessage[] {
  return messages.map((message, index) =>
    index >= fromIndex && message.sender === GAME_MYSTERY_NAME
      ? { ...message, sender: speaker.name, avatarUrl: speaker.avatarUrl, gender: speaker.gender }
      : message,
  );
}

/** What one message response means for client state. */
export interface GameTurnOutcome {
  /** The player asked to give up in chat: show the confirmation, append nothing. */
  giveUpRequested: boolean;
  /** The speaker's reply to append, or null (give-up requests have none). */
  reply: GameMessage | null;
  lastEvent: GameEvent | null;
  /** `undefined` leaves the token as is; `null` ends the run; a string replaces it. */
  token?: string | null;
  /** Set on a correct guess, so the caller can raise the personal best. */
  newStreak?: number;
}

/**
 * Interprets a message response. `speaker` is who was speaking when the message was sent;
 * a shown-speaker game's replies are all theirs, even on a correct guess (the next
 * character isn't generated until the player continues). A hidden-speaker game's replies
 * carry the mystery placeholder until a reveal, then the revealed identity. Throws on a
 * malformed response.
 */
export function applyGameMessageResponse(
  game: GameDefinition,
  data: GameMessageResponse,
  speaker: GameSpeaker,
): GameTurnOutcome {
  if (data.giveUpRequested) {
    return { giveUpRequested: true, reply: null, lastEvent: null };
  }
  if (typeof data.reply !== "string" || !data.reply) {
    throw new Error(`Invalid response from /api/${game.slug}/message`);
  }

  const revealing = Boolean(data.correct || data.gameOver);
  if (game.hidesSpeaker && revealing && !data.revealedName) {
    throw new Error(`Invalid response from /api/${game.slug}/message`);
  }
  const reveal: Pick<GameSpeaker, "avatarUrl" | "gender"> | undefined =
    game.hidesSpeaker && revealing
      ? { avatarUrl: data.avatarUrl || GAME_FALLBACK_AVATAR, gender: data.gender ?? null }
      : undefined;

  let reply: GameMessage;
  if (reveal) {
    // Spoken by the now-revealed identity, not the mystery placeholder; pairs with
    // revealGameMessages, which the caller applies to every earlier message this round.
    reply = {
      sender: data.revealedName as string,
      text: data.reply,
      audioFileUrl: data.audioFileUrl,
      ...reveal,
    };
  } else if (game.hidesSpeaker) {
    reply = { sender: GAME_MYSTERY_NAME, text: data.reply, audioFileUrl: data.audioFileUrl };
  } else {
    reply = {
      sender: speaker.name,
      text: data.reply,
      audioFileUrl: data.audioFileUrl,
      avatarUrl: speaker.avatarUrl,
      gender: speaker.gender,
    };
  }

  if (data.correct) {
    return {
      giveUpRequested: false,
      reply,
      lastEvent: {
        type: "correct",
        revealedName: data.revealedName ?? "",
        ...reveal,
        streak: data.streak ?? 0,
      },
      token: typeof data.token === "string" ? data.token : undefined,
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
        ...reveal,
        finalStreak: data.finalStreak ?? 0,
      },
      token: null,
    };
  }
  if (data.wrongGuessesRemaining !== undefined) {
    return {
      giveUpRequested: false,
      reply,
      lastEvent: { type: "wrong", wrongGuessesRemaining: data.wrongGuessesRemaining },
      token: typeof data.token === "string" ? data.token : undefined,
    };
  }
  return { giveUpRequested: false, reply, lastEvent: null };
}

/** Builds the game-over event for a give-up, carrying the reveal fields only when the game has them. */
export function giveUpEvent(game: GameDefinition, data: GameGiveUpResponse): GameEvent {
  return {
    type: "gameover",
    revealedName: data.revealedName,
    ...(game.hidesSpeaker
      ? { avatarUrl: data.avatarUrl || GAME_FALLBACK_AVATAR, gender: data.gender ?? null }
      : {}),
    finalStreak: data.finalStreak,
  };
}

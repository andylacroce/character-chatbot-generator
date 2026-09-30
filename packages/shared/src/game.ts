/**
 * The guessing-game engine's platform-agnostic core, shared by the web app, the mobile
 * app, and the server routes. "Guess Who" and "Guess Who's Next" are one game with two
 * `GameDefinition`s: everything that differs between them (whether the chat partner is
 * the mystery itself, the wire name of the round token, the storage keys, the copy) is a
 * field on the definition, and everything else (state transitions, response parsing,
 * the request transport) lives here once. Plain data in, plain data out, so the rules
 * for interpreting a server response can't drift between platforms or between games.
 */

import { GUESS_WHO_COPY, GUESS_WHO_NEXT_COPY, type GameCopy } from "./gameCopy";
import { STORAGE_KEYS } from "./storageKeys";
import type {
  GameGiveUpResponse,
  GameHighScoreResponse,
  GameMessageRequest,
  GameMessageResponse,
  GameRoundResult,
  GameSpeaker,
} from "./types";

/** Stable identifier for a game, used as a registry key and in navigation/test ids. */
export type GameId = "guessWho" | "guessWhoNext";

/** Everything that differs between the two games. See the module doc above. */
export interface GameDefinition {
  id: GameId;
  title: string;
  /** URL segment shared by the web page, the `/api/{slug}/*` routes, and the leaderboard tab. */
  slug: "guess-who" | "guess-who-next";
  /**
   * Wire name of the round token in request and response bodies. Kept per game, exactly as
   * first shipped, so already-released mobile builds keep working against the unified routes.
   */
  tokenField: "guessWhoToken" | "gameToken";
  /** Prefix of this game's analytics events and log events, e.g. `guess_who_next_started`. */
  eventPrefix: "guess_who" | "guess_who_next";
  /**
   * True when the character being chatted with IS the mystery ("Guess Who"): its name and
   * avatar are withheld until a reveal. False when the chat partner is named and shown and
   * the mystery is a different, hidden figure it steers toward ("Guess Who's Next").
   */
  hidesSpeaker: boolean;
  storageKeys: { token: string; transcript: string; instructionsSeen: string };
  copy: GameCopy;
}

/** "Guess Who": chat with a mystery character who never names itself. */
export const GUESS_WHO: GameDefinition = {
  id: "guessWho",
  title: "Guess Who",
  slug: "guess-who",
  tokenField: "guessWhoToken",
  eventPrefix: "guess_who",
  hidesSpeaker: true,
  storageKeys: {
    token: STORAGE_KEYS.guessWhoToken,
    transcript: STORAGE_KEYS.guessWhoTranscript,
    instructionsSeen: STORAGE_KEYS.guessWhoInstructionsSeen,
  },
  copy: GUESS_WHO_COPY,
};

/** "Guess Who's Next": chat with a named character who steers toward a hidden one. */
export const GUESS_WHO_NEXT: GameDefinition = {
  id: "guessWhoNext",
  title: "Guess Who's Next",
  slug: "guess-who-next",
  tokenField: "gameToken",
  eventPrefix: "guess_who_next",
  hidesSpeaker: false,
  storageKeys: {
    token: STORAGE_KEYS.guessWhoNextToken,
    transcript: STORAGE_KEYS.guessWhoNextTranscript,
    instructionsSeen: STORAGE_KEYS.guessWhoNextInstructionsSeen,
  },
  copy: GUESS_WHO_NEXT_COPY,
};

/** Every game by id. */
export const GAMES: Record<GameId, GameDefinition> = {
  guessWho: GUESS_WHO,
  guessWhoNext: GUESS_WHO_NEXT,
};

/** Games in display order: "Guess Who" first everywhere both are listed (a standing product rule). */
export const GAME_LIST: readonly GameDefinition[] = [GUESS_WHO, GUESS_WHO_NEXT];

/** Looks a game up by its URL slug, or undefined for anything that isn't one. */
export function gameBySlug(slug: unknown): GameDefinition | undefined {
  return GAME_LIST.find((game) => game.slug === slug);
}

/** The endpoints every game exposes under `/api/{slug}/`. */
export type GameEndpoint =
  | "start"
  | "continue"
  | "message"
  | "give-up"
  | "high-score"
  | "leaderboard"
  | "leaderboard-settings";

/** The API path of one of a game's endpoints. */
export function gameApiUrl(game: GameDefinition, endpoint: GameEndpoint): string {
  return `/api/${game.slug}/${endpoint}`;
}

/** Placeholder avatar shown while a round's identity is hidden, or as a reveal fallback. */
export const GAME_FALLBACK_AVATAR = "/silhouette.svg";

/** Sender label used for the mystery character's messages while its identity is unknown. */
export const GAME_MYSTERY_NAME = "???";

/** The speaker shown while a hidden-speaker game's identity is still unknown. */
export const MYSTERY_SPEAKER: GameSpeaker = {
  name: GAME_MYSTERY_NAME,
  avatarUrl: GAME_FALLBACK_AVATAR,
  gender: null,
};

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

/** Network calls the session needs. Each rejects on failure; round results are pre-validated. */
export interface GameTransport {
  start(): Promise<GameRoundResult>;
  continueRound(token: string): Promise<GameRoundResult>;
  sendMessage(request: GameMessageRequest): Promise<GameMessageResponse>;
  giveUp(token: string): Promise<GameGiveUpResponse>;
  getHighScore(): Promise<GameHighScoreResponse>;
}

/**
 * The raw request primitives a platform supplies. Each rejects on a non-2xx status.
 * `round` is start/continue: the web reads real SSE progress there, mobile sends plain JSON.
 */
export interface GameIO {
  get(url: string): Promise<unknown>;
  post(url: string, body: Record<string, unknown>): Promise<unknown>;
  round(kind: "start" | "continue", url: string, body: Record<string, unknown>): Promise<unknown>;
}

/**
 * Builds a game's `GameTransport` on a platform's raw request primitives: the URLs, the
 * per-game wire token name, and response validation all live here, once, for both apps.
 */
export function createGameTransport(game: GameDefinition, io: GameIO): GameTransport {
  const startUrl = gameApiUrl(game, "start");
  const continueUrl = gameApiUrl(game, "continue");
  return {
    start: async () => parseGameRoundResult(game, await io.round("start", startUrl, {}), startUrl),
    continueRound: async (token) =>
      parseGameRoundResult(
        game,
        await io.round("continue", continueUrl, { [game.tokenField]: token }),
        continueUrl,
      ),
    sendMessage: async ({ token, message, conversationHistory }) =>
      parseGameMessageResponse(
        game,
        await io.post(gameApiUrl(game, "message"), {
          [game.tokenField]: token,
          message,
          conversationHistory,
        }),
      ),
    giveUp: async (token) =>
      (await io.post(gameApiUrl(game, "give-up"), {
        [game.tokenField]: token,
      })) as GameGiveUpResponse,
    getHighScore: async () =>
      (await io.get(gameApiUrl(game, "high-score"))) as GameHighScoreResponse,
  };
}

/**
 * The guessing games' registry: the `GameDefinition` each game is built from (everything that
 * differs between "Guess Who" and "Guess Who's Next"), lookup by slug, and endpoint URLs.
 */

import { GUESS_WHO_COPY, GUESS_WHO_NEXT_COPY, type GameCopy } from "./gameCopy";
import { STORAGE_KEYS } from "./storageKeys";
import type { GameSpeaker } from "./types";

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

/**
 * The guessing games' request layer: a transport built from a `GameDefinition` and the
 * platform's own `fetch`, so web and mobile share one set of calls and response parsing.
 */

import type {
  GameGiveUpResponse,
  GameHighScoreResponse,
  GameMessageRequest,
  GameMessageResponse,
  GameRoundResult,
} from "./types";
import { GameDefinition, gameApiUrl } from "./gameDefinitions";
import { parseGameRoundResult, parseGameMessageResponse } from "./gameState";

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

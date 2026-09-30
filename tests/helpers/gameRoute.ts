/**
 * Shared fixtures for the `/api/[game]/*` route tests, which run every case once per game
 * (`describe.each(GAMES_UNDER_TEST)`) since one route file serves both guessing games.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { GUESS_WHO, GUESS_WHO_NEXT, type GameDefinition } from "character-chatbot-shared";
import type { GameState } from "../../src/utils/game/token";

process.env.API_SECRET = process.env.API_SECRET || "test-api-secret";

export const GAMES_UNDER_TEST: GameDefinition[] = [GUESS_WHO, GUESS_WHO_NEXT];

/** A minimal Next response double; `write` is there for the SSE (stream: true) paths. */
export function makeRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = jest.fn().mockReturnValue(res as NextApiResponse);
  res.json = jest.fn().mockReturnValue(res as NextApiResponse);
  res.end = jest.fn().mockReturnValue(res as NextApiResponse);
  res.setHeader = jest.fn();
  res.write = jest.fn();
  return res as NextApiResponse;
}

/** A request for `game`'s route (the `[game]` path segment arrives as `query.game`). */
export function makeReq(
  game: GameDefinition,
  body?: Record<string, unknown>,
  method = "POST",
): NextApiRequest {
  return { method, body, query: { game: game.slug } } as Partial<NextApiRequest> as NextApiRequest;
}

/** The JSON body of the response's first `res.json(...)` call. */
export function sentJson(res: NextApiResponse) {
  return (res.json as jest.Mock).mock.calls[0][0];
}

/** Every SSE frame written to the response, parsed. */
export function sseFrames(res: NextApiResponse) {
  return (res.write as jest.Mock).mock.calls.map((call) => JSON.parse(call[0].slice(6)));
}

/**
 * A round's token state for `game`: in "Guess Who" the speaker is the hidden target itself;
 * in "Guess Who's Next" a named speaker steers toward a different hidden target.
 */
export function makeState(game: GameDefinition, overrides: Partial<GameState> = {}): GameState {
  return {
    game: game.id,
    runId: "run-1",
    speakerName: game.hidesSpeaker ? "Irene Adler" : "Sherlock Holmes",
    targetName: "Irene Adler",
    personaPrompt: "persona prompt here",
    avatarUrl: "https://example.com/avatar.png",
    gender: "female",
    voiceConfig: { languageCodes: ["en-GB"], name: "en-GB-Wavenad-D", ssmlGender: 1 },
    usedNames: [game.hidesSpeaker ? "Irene Adler" : "Sherlock Holmes"],
    streak: 2,
    wrongGuessCount: 0,
    environment: "test",
    issuedForUserId: null,
    issuedForGuestId: null,
    ...overrides,
  };
}

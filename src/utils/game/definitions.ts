/**
 * The server half of each guessing game's definition: the shared `GameDefinition` (slug,
 * wire token name, event prefix, whether the speaker is the mystery) plus the score tables
 * only the server knows. Looked up by the `[game]` segment of `/api/[game]/*`, so one set of
 * route handlers serves both games. Deliberately light (no Claude imports), since every
 * route loads it; round generation's persona and opening choices live in round.ts.
 */

import { gameBySlug, GAMES, type GameDefinition } from "character-chatbot-shared";
import {
  guessWhoGuestProfiles,
  guessWhoHighScores,
  guessWhoNextGuestProfiles,
  guessWhoNextHighScores,
  guessWhoNextResults,
  guessWhoResults,
} from "../../db/schema";

/**
 * The three tables one game keeps scores in. The two games' tables are structurally
 * identical (see schema.ts), so one game's set stands in for the type of both.
 */
export interface ScoreTables {
  highScores: typeof guessWhoHighScores;
  results: typeof guessWhoResults;
  guestProfiles: typeof guessWhoGuestProfiles;
}

export interface ServerGame extends GameDefinition {
  tables: ScoreTables;
}

const SERVER_GAMES: Record<string, ServerGame> = {
  guessWho: {
    ...GAMES.guessWho,
    tables: {
      highScores: guessWhoHighScores,
      results: guessWhoResults,
      guestProfiles: guessWhoGuestProfiles,
    },
  },
  guessWhoNext: {
    ...GAMES.guessWhoNext,
    // Structurally identical to guessWho's tables, see the ScoreTables doc above.
    tables: {
      highScores: guessWhoNextHighScores,
      results: guessWhoNextResults,
      guestProfiles: guessWhoNextGuestProfiles,
    } as unknown as ScoreTables,
  },
};

/** Resolves a route's `[game]` segment to its server definition, or undefined for an unknown game. */
export function getServerGame(slug: unknown): ServerGame | undefined {
  const game: GameDefinition | undefined = gameBySlug(slug);
  return game && SERVER_GAMES[game.id];
}

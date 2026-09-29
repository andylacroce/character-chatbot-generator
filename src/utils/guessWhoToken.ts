/**
 * Encrypts "Guess Who" (the clue-reveal game)'s per-round state into an opaque token
 * the client holds and echoes back on every /api/guess-who/* call — same rationale as
 * guessWhoNextToken.ts (guest is fully client-authoritative, the DB is a bonus never a
 * requirement; the hidden name must never be readable by the client), built on the same
 * extracted `tokenCrypto.ts` so both games share one AES-GCM implementation and
 * key-derivation chain. Unlike the chat-steering game, there's no persona prompt, avatar,
 * or voice config in-round — just the hidden name and its ordered clue list, since clues
 * are generated once per round by a single Claude call (see guessWhoRound.ts) rather than
 * building up through conversation.
 */

import { encryptPayload, decryptPayload } from "./tokenCrypto";

/** Same fallback chain as guessWhoNextToken.ts — no new required configuration. */
const SECRET_ENV_VARS = ["GAME_TOKEN_SECRET", "NEXTAUTH_SECRET", "API_SECRET"];

/** "Guess Who"'s full per-round state, encrypted end-to-end inside the token. */
export interface GuessWhoStatePayload {
  /** Stable identifier for a run, used as the leaderboard result row's id. */
  runId: string;
  /** The figure the player is trying to guess — never sent to the client directly. */
  hiddenName: string;
  /** Ordered vague-to-specific clues about hiddenName, from generateCharacterClues. */
  clues: string[];
  /** How many of `clues` have been shown so far (starts at 1 — the first clue shows immediately). */
  revealedCount: number;
  /** Every hidden name already met this streak, so a new round never repeats one. */
  usedNames: string[];
  streak: number;
  environment: string;
  issuedForUserId: string | null;
  issuedForGuestId: string | null;
}

/** Runtime shape check for a decrypted payload before trusting it as a GuessWhoStatePayload. */
function isValidPayload(value: unknown): value is GuessWhoStatePayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.runId === "string" &&
    v.runId.length > 0 &&
    typeof v.hiddenName === "string" &&
    Array.isArray(v.clues) &&
    v.clues.every((clue) => typeof clue === "string") &&
    typeof v.revealedCount === "number" &&
    v.revealedCount >= 1 &&
    v.revealedCount <= v.clues.length &&
    Array.isArray(v.usedNames) &&
    v.usedNames.every((name) => typeof name === "string") &&
    typeof v.streak === "number" &&
    typeof v.environment === "string" &&
    (v.issuedForUserId === null || typeof v.issuedForUserId === "string") &&
    (v.issuedForGuestId === null || typeof v.issuedForGuestId === "string")
  );
}

/** Encrypts a round's state into an opaque, base64url token for the client to hold. */
export function signGuessWhoState(payload: GuessWhoStatePayload): string {
  return encryptPayload(payload, SECRET_ENV_VARS);
}

/**
 * Decrypts and verifies a "Guess Who" token. Fails CLOSED, same as guessWhoNextToken.ts's
 * verifyGameState: any tamper, malformed input, or wrong key returns null, never throws.
 */
export function verifyGuessWhoState(token: string): GuessWhoStatePayload | null {
  const parsed = decryptPayload(token, SECRET_ENV_VARS);
  return isValidPayload(parsed) ? parsed : null;
}

/**
 * Encrypts "Guess Who" (the self-describing chat game)'s per-round state into an opaque
 * token the client holds and echoes back on every /api/guess-who/* call. The player
 * chats with a character that never reveals its own name (`hiddenName`) — it talks
 * about itself, dropping escalating real clues, but the actual identity, its avatar,
 * and its voice all live only inside this encrypted token until a correct guess or
 * give-up releases them. Built on the same extracted `tokenCrypto.ts` AES-GCM
 * implementation and key-derivation chain as guessWhoNextToken.ts, and fails CLOSED for
 * the same reason: any tamper, malformed input, or decrypt failure must never be
 * treated as a verified game state.
 */

import type { CharacterVoiceConfig } from "./characterVoices";
import { encryptPayload, decryptPayload } from "./tokenCrypto";

/** Same fallback chain as guessWhoNextToken.ts — no new required configuration. */
const SECRET_ENV_VARS = ["GAME_TOKEN_SECRET", "NEXTAUTH_SECRET", "API_SECRET"];

/** "Guess Who"'s full per-round state, encrypted end-to-end inside the token. */
export interface GuessWhoStatePayload {
  /** Stable identifier for a run, used as the leaderboard result row's id. */
  runId: string;
  /** The figure the player is chatting with and trying to guess — never sent to the client. */
  hiddenName: string;
  /** hiddenName's full self-describing system prompt (see generateGuessWhoSelfCluePersonaPrompt). */
  personaPrompt: string;
  /** hiddenName's avatar — generated eagerly for full audio parity, but withheld from the client until reveal. */
  avatarUrl: string;
  gender: string | null;
  /** hiddenName's TTS voice, resolved server-side each round so the client never needs to fetch it itself. */
  voiceConfig: CharacterVoiceConfig;
  /** Every hidden name already met this streak, so a new round never repeats one. */
  usedNames: string[];
  streak: number;
  /** 0 or 1 — a 2nd wrong guess ends the run, enforced by pages/api/guess-who/message.ts. */
  wrongGuessCount: 0 | 1;
  environment: string;
  issuedForUserId: string | null;
  issuedForGuestId: string | null;
  /** True only after the server judged a correct guess for this round. */
  canContinue?: boolean;
}

/** Runtime shape check for a decrypted payload before trusting it as a GuessWhoStatePayload. */
function isValidPayload(value: unknown): value is GuessWhoStatePayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.runId === "string" &&
    v.runId.length > 0 &&
    typeof v.hiddenName === "string" &&
    typeof v.personaPrompt === "string" &&
    typeof v.avatarUrl === "string" &&
    (v.gender === null || typeof v.gender === "string") &&
    typeof v.voiceConfig === "object" &&
    v.voiceConfig !== null &&
    Array.isArray(v.usedNames) &&
    v.usedNames.every((name) => typeof name === "string") &&
    typeof v.streak === "number" &&
    (v.wrongGuessCount === 0 || v.wrongGuessCount === 1) &&
    typeof v.environment === "string" &&
    (v.issuedForUserId === null || typeof v.issuedForUserId === "string") &&
    (v.issuedForGuestId === null || typeof v.issuedForGuestId === "string") &&
    (v.canContinue === undefined || typeof v.canContinue === "boolean")
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

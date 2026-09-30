/**
 * Encrypts a guessing game's per-round state into an opaque token the client holds and
 * echoes back on every `/api/{game}/*` call. Both games share one payload: the `speakerName`
 * the player is chatting with and the `targetName` they're trying to guess. In "Guess Who's
 * Next" those are two different characters (the speaker is shown, the target is hidden); in
 * "Guess Who" they're the same one, and its name and avatar stay inside this token until a
 * reveal. Neither name is ever readable by the client (guest or signed-in), and this app's
 * dominant pattern is "guest is fully client-authoritative, the database is a bonus, never a
 * requirement" (see CLAUDE.md's account-persistence notes), so there's no DB-backed session
 * table: AES-256-GCM (see tokenCrypto.ts) both hides the payload and detects tampering.
 *
 * Key derivation deliberately never falls back to a per-process random key: Vercel runs
 * multiple concurrent serverless instances with no sticky routing, so a random-per-instance
 * key would cause silent, instance-dependent decrypt failures mid-game. Deriving from
 * API_SECRET (already required) means zero new configuration and a stable key across every
 * instance; only a deliberate secret rotation ever invalidates an in-flight token.
 *
 * verifyGameState() fails CLOSED, the one deliberate exception to this codebase's usual
 * fail-open convention: any tamper, malformed input, decrypt failure, or a token minted for
 * the OTHER game returns null, never a partially-trusted state.
 */

import type { GameId } from "character-chatbot-shared";
import type { CharacterVoiceConfig } from "../characterVoices";
import { encryptPayload, decryptPayload } from "../tokenCrypto";

/** Fallback chain for deriving the AES key, see tokenCrypto.ts's module doc. */
const SECRET_ENV_VARS = ["GAME_TOKEN_SECRET", "NEXTAUTH_SECRET", "API_SECRET"];

/** A guessing game's full per-round state, encrypted end-to-end inside the token. */
export interface GameState {
  /** Which game minted this token; a token never verifies against the other game's routes. */
  game: GameId;
  /** Stable identifier for a run, used as the leaderboard result row's id. Absent only on old tokens. */
  runId?: string;
  /** The character the player is chatting with, whose persona, avatar and voice this round uses. */
  speakerName: string;
  /** The figure the player is trying to guess. Equal to `speakerName` in "Guess Who". Never sent to the client. */
  targetName: string;
  /** The speaker's full system prompt: its own persona plus the game's clue rules. */
  personaPrompt: string;
  avatarUrl: string;
  gender: string | null;
  /** The speaker's TTS voice, resolved server-side each round so the client never needs to fetch it itself. */
  voiceConfig: CharacterVoiceConfig;
  /** Every name already met this streak, so a new round never repeats one. */
  usedNames: string[];
  streak: number;
  /** 0 or 1: a 2nd wrong guess ends the run, enforced by the message route. */
  wrongGuessCount: 0 | 1;
  environment: string;
  /** Convenience only: the signed-in user id at issuance, never trusted for auth. */
  issuedForUserId: string | null;
  /** Hashed, cookie-bound guest identity at issuance. */
  issuedForGuestId: string | null;
  /** True only after the server judged a correct guess for this round. */
  canContinue?: boolean;
}

/** True for `null` or a string, the shape of every optional string field in the payload. */
const isNullableString = (v: unknown) => v === null || typeof v === "string";

/** Runtime shape check for a decrypted payload's fields shared by every token shape. */
function hasValidCommonFields(v: Record<string, unknown>): boolean {
  return (
    (v.runId === undefined || (typeof v.runId === "string" && v.runId.length > 0)) &&
    typeof v.personaPrompt === "string" &&
    typeof v.avatarUrl === "string" &&
    isNullableString(v.gender) &&
    typeof v.voiceConfig === "object" &&
    v.voiceConfig !== null &&
    Array.isArray(v.usedNames) &&
    v.usedNames.every((name) => typeof name === "string") &&
    typeof v.streak === "number" &&
    (v.wrongGuessCount === 0 || v.wrongGuessCount === 1) &&
    typeof v.environment === "string" &&
    isNullableString(v.issuedForUserId) &&
    (v.issuedForGuestId === undefined || isNullableString(v.issuedForGuestId)) &&
    (v.canContinue === undefined || typeof v.canContinue === "boolean")
  );
}

/**
 * Maps a token minted before the two games shared one payload onto the current shape, so a
 * run already in a player's storage survives the deploy. "Guess Who" tokens named one
 * `hiddenName`; "Guess Who's Next" tokens named `currentCharacterName` (shown) and
 * `nextCharacterName` (hidden). Safe to delete once no pre-unification token can still be
 * in a client's storage, at the cost of resetting any such run to the start screen.
 */
function fromLegacy(game: GameId, v: Record<string, unknown>): Record<string, unknown> | null {
  if (game === "guessWho" && typeof v.hiddenName === "string") {
    const { hiddenName, ...rest } = v;
    return { ...rest, game, speakerName: hiddenName, targetName: hiddenName };
  }
  if (
    game === "guessWhoNext" &&
    typeof v.currentCharacterName === "string" &&
    typeof v.nextCharacterName === "string"
  ) {
    const { currentCharacterName, nextCharacterName, ...rest } = v;
    return { ...rest, game, speakerName: currentCharacterName, targetName: nextCharacterName };
  }
  return null;
}

/** Encrypts a round's state into an opaque, base64url token for the client to hold. */
export function signGameState(state: GameState): string {
  return encryptPayload(state, SECRET_ENV_VARS);
}

/**
 * Decrypts and verifies a round token for `game`. Fails CLOSED: any tamper, malformed
 * input, wrong key (e.g. after a manual secret rotation), or token minted for the other
 * game returns null, never throws.
 */
export function verifyGameState(token: unknown, game: GameId): GameState | null {
  if (typeof token !== "string") return null;
  const parsed = decryptPayload(token, SECRET_ENV_VARS);
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  const v = "game" in raw ? (raw.game === game ? raw : null) : fromLegacy(game, raw);
  if (
    !v ||
    typeof v.speakerName !== "string" ||
    typeof v.targetName !== "string" ||
    !hasValidCommonFields(v)
  ) {
    return null;
  }
  return { ...v, issuedForGuestId: v.issuedForGuestId ?? null } as unknown as GameState;
}

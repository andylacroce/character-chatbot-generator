/**
 * Encrypts the guessing game's per-round state into an opaque token that the client
 * holds and echoes back on every game API call. The chain works like this: the player
 * chats with a real, NAMED character (`currentCharacterName`, shown to the client) who
 * talks as itself but steers the conversation toward hints about a different, HIDDEN
 * character (`nextCharacterName`) — that hidden name is the actual guess target. A
 * correct guess reveals it and it becomes the new `currentCharacterName`, continuing the
 * chain. `nextCharacterName` must never be readable by the client (guest or signed-in),
 * and this app's dominant pattern is "guest is fully client-authoritative, the database
 * is a bonus, never a requirement" (see CLAUDE.md's account-persistence notes) — a
 * DB-backed session table would be the first piece of core gameplay to require a
 * database. AES-256-GCM authenticated encryption both hides the payload and detects
 * tampering, which a plain session id wouldn't buy for free.
 *
 * Key derivation deliberately never falls back to a per-process random key: Vercel runs
 * multiple concurrent serverless instances with no sticky routing, so a random-per-
 * instance key would cause silent, instance-dependent decrypt failures mid-game rather
 * than a clean "please start a new game" degrade. Deriving from API_SECRET (already a
 * required env var in this app) means zero new required configuration and a stable key
 * across every instance — only a deliberate secret rotation ever invalidates an
 * in-flight token.
 *
 * verifyGameState() deliberately fails CLOSED — the one intentional exception to this
 * codebase's usual fail-open convention (an avatar-cache miss regenerates; a
 * personality-generation error falls back to a generic template). Any tamper, malformed
 * input, or decrypt failure here must never be treated as a verified game state.
 */

import crypto from "crypto";
import type { CharacterVoiceConfig } from "./characterVoices";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 1;

/** The guessing game's full per-round state, encrypted end-to-end inside the token. */
export interface GameStatePayload {
  /** The character the player is currently chatting with — revealed, shown to the client. */
  currentCharacterName: string;
  /** The hidden figure `currentCharacterName` is steering the conversation toward — the actual guess target. Never sent to the client. */
  nextCharacterName: string;
  /** currentCharacterName's full system prompt: its own persona plus the clue-steering rules about nextCharacterName. */
  personaPrompt: string;
  /** currentCharacterName's avatar — safe to show, since it's never the hidden target. */
  avatarUrl: string;
  gender: string | null;
  /** currentCharacterName's TTS voice, resolved server-side each round so the client never needs to fetch it itself. */
  voiceConfig: CharacterVoiceConfig;
  /** Every character already met as currentCharacterName this streak, so a new target never repeats one. */
  usedNames: string[];
  streak: number;
  /** 0 or 1 — a 2nd wrong guess ends the run, enforced by pages/api/game/guess.ts. */
  wrongGuessCount: 0 | 1;
  environment: string;
  /** Convenience only — the signed-in user id at issuance, never trusted for auth. */
  issuedForUserId: string | null;
}

let cachedKey: Buffer | null = null;

/** Derives the stable AES-256 key from the app's existing secrets — see module doc above. */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret =
    process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || process.env.API_SECRET;
  if (!secret) {
    // API_SECRET is a required env var for this app (see CLAUDE.md) — reaching this
    // means a genuinely broken deployment, not a case to silently paper over.
    throw new Error("No secret configured to derive the game token key");
  }
  cachedKey = crypto.createHash("sha256").update(secret).digest();
  return cachedKey;
}

/** Runtime shape check for a decrypted payload before trusting it as a GameStatePayload. */
function isValidPayload(value: unknown): value is GameStatePayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.currentCharacterName === "string" &&
    typeof v.nextCharacterName === "string" &&
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
    (v.issuedForUserId === null || typeof v.issuedForUserId === "string")
  );
}

/** Encrypts a round's game state into an opaque, base64url token for the client to hold. */
export function signGameState(payload: GameStatePayload): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const versioned = Buffer.concat([Buffer.from([VERSION]), iv, authTag, encrypted]);
  return versioned.toString("base64url");
}

/**
 * Decrypts and verifies a game state token. Fails CLOSED: any tamper, malformed input,
 * unsupported version, or wrong key (e.g. after a manual secret rotation) returns null —
 * never throws, and never returns a partially-trusted payload.
 */
export function verifyGameState(token: string): GameStatePayload | null {
  try {
    if (typeof token !== "string" || !token) return null;
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH) return null;
    if (raw[0] !== VERSION) return null;
    const iv = raw.subarray(1, 1 + IV_LENGTH);
    const authTag = raw.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = raw.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString("utf8"));
    return isValidPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

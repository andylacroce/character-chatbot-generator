/**
 * Generic AES-256-GCM encrypt/decrypt for this app's opaque, client-held game tokens —
 * extracted out of `guessWhoNextToken.ts` so the chat-steering game ("Guess Who's Next") and the
 * clue-reveal game ("Guess Who") share one key-derivation chain and wire format instead
 * of two independent copies. See `guessWhoNextToken.ts`'s module doc for the full rationale
 * (why a client-held encrypted token instead of a DB-backed session, why key derivation
 * never falls back to a per-process random key, why verification fails closed) — none of
 * that changed by this extraction, it's a byte-identical refactor.
 *
 * Wire format: `version(1 byte) || iv(12 bytes) || authTag(16 bytes) || ciphertext`,
 * base64url-encoded. `secretEnvVars` lets each token type derive its key from its own
 * fallback chain while still sharing the same hashing/AES logic.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 1;

const keyCache = new Map<string, Buffer>();

/**
 * Derives a stable AES-256 key from the first set env var in `secretEnvVars`, caching it
 * per unique var list so repeated calls (e.g. once per request) don't re-hash. Throws if
 * none of the candidate env vars are set — reaching that means a genuinely broken
 * deployment (this app's `API_SECRET` is always required), not a case to paper over.
 */
function getKey(secretEnvVars: string[]): Buffer {
  const cacheKey = secretEnvVars.join("|");
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;
  const secret = secretEnvVars.map((name) => process.env[name]).find(Boolean);
  if (!secret) {
    throw new Error(
      `No secret configured to derive a token key (checked: ${secretEnvVars.join(", ")})`,
    );
  }
  const key = crypto.createHash("sha256").update(secret).digest();
  keyCache.set(cacheKey, key);
  return key;
}

/** Encrypts a JSON-serializable payload into an opaque, base64url token. */
export function encryptPayload(payload: unknown, secretEnvVars: string[]): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(secretEnvVars), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const versioned = Buffer.concat([Buffer.from([VERSION]), iv, authTag, encrypted]);
  return versioned.toString("base64url");
}

/**
 * Decrypts and JSON-parses a token produced by `encryptPayload`. Fails CLOSED: any
 * tamper, malformed input, unsupported version, or wrong key returns `null`, never
 * throws, and never returns a partially-trusted value. Callers must still runtime-check
 * the parsed shape before trusting it as their specific payload type.
 */
export function decryptPayload(token: string, secretEnvVars: string[]): unknown {
  try {
    if (typeof token !== "string" || !token) return null;
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH) return null;
    if (raw[0] !== VERSION) return null;
    const iv = raw.subarray(1, 1 + IV_LENGTH);
    const authTag = raw.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = raw.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(secretEnvVars), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

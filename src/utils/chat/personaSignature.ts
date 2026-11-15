/**
 * Signs the (name, personality) pair `/api/generate-personality` returns, so `/api/chat` and
 * `/api/bots` can tell a persona this server vetted from one an API client made up. The persona
 * is not secret, so this is an HMAC (integrity only), not encryption. Without it any caller could
 * skip moderation and send an arbitrary system prompt (or an unmoderated name inside the prompt).
 * There is no unsigned exemption: even a generic persona for a name must come from the server.
 *
 * Keys: `PERSONA_SECRET`, `NEXTAUTH_SECRET`, and `API_SECRET` only off Vercel (it ships inside the
 * mobile bundle, so it must never key a deployment). With no key, signing yields undefined and
 * verifying fails; outside production the chat and bots routes then accept unsigned personas so
 * local dev works (`personaChecksEnforced`).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { logEvent } from "../logger";

let loggedNoKey = false;

/** The first configured signing key, or undefined (logged once per process). */
function signingKey(): string | undefined {
  const key =
    process.env.PERSONA_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    (process.env.VERCEL ? undefined : process.env.API_SECRET);
  if (!key && !loggedNoKey) {
    loggedNoKey = true;
    logEvent("error", "persona_key_missing", "No persona signing key is configured");
  }
  return key || undefined;
}

/** HMAC over a JSON-encoded versioned payload (unambiguous, unlike newline joining), base64url. */
function mac(key: string, name: string, personality: string): string {
  return createHmac("sha256", key)
    .update(JSON.stringify(["v1", name, personality]))
    .digest("base64url");
}

/** Signs a persona, or returns undefined when no key is configured. */
export function signPersona(name: string, personality: string): string | undefined {
  const key = signingKey();
  return key ? mac(key, name, personality) : undefined;
}

/** True when `signature` is the valid signature for exactly this name and personality. */
export function verifyPersona(name: string, personality: string, signature: unknown): boolean {
  const key = signingKey();
  if (!key || typeof signature !== "string") return false;
  const expected = Buffer.from(mac(key, name, personality));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** False only in non-production with no key configured, where unsigned personas are let through. */
export function personaChecksEnforced(): boolean {
  return process.env.NODE_ENV === "production" || signingKey() !== undefined;
}

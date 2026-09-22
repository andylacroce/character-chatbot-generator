/**
 * Short-lived signed state for the mobile Google sign-in bridge (see
 * pages/api/auth/mobile-google-start.ts and mobile-google-callback.ts). Carries the app's
 * own redirect URI through Google's OAuth round trip without any server-side session
 * storage — encrypted+authenticated the same way NextAuth's own session/CSRF tokens are
 * (next-auth/jwt's encode/decode, a JWE), but under a distinct `salt` so a state token can
 * never be confused with (or substituted for) a real bearer session token even if one were
 * replayed in the wrong place.
 */

import { encode, decode } from "next-auth/jwt";

const STATE_SALT = "mobile-auth-state";
const STATE_MAX_AGE_SECONDS = 5 * 60;

/** Signs a short-lived (5 min) state token carrying the app's own redirect URI. */
export async function signMobileAuthState(redirectUri: string): Promise<string> {
  return encode({
    token: { redirectUri },
    secret: process.env.NEXTAUTH_SECRET ?? "",
    salt: STATE_SALT,
    maxAge: STATE_MAX_AGE_SECONDS,
  });
}

/** Verifies a state token, returning its redirectUri, or null if invalid/expired/tampered. */
export async function verifyMobileAuthState(
  state: string,
): Promise<{ redirectUri: string } | null> {
  try {
    const payload = await decode({
      token: state,
      secret: process.env.NEXTAUTH_SECRET ?? "",
      salt: STATE_SALT,
    });
    const redirectUri = payload?.redirectUri;
    return typeof redirectUri === "string" ? { redirectUri } : null;
  } catch {
    return null;
  }
}

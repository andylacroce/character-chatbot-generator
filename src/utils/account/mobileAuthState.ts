/**
 * Short-lived signed state for the generic mobile sign-in bridge (see
 * app/api/auth/mobile-auth-start/route.ts and mobile-auth-complete.ts). Carries the app's own
 * redirect URI through NextAuth's own sign-in flow — including an OAuth provider's round
 * trip to Google and back, or a magic-link email's click-days-later round trip — without
 * any server-side session storage of our own — encrypted+authenticated the same way
 * NextAuth's own session/CSRF tokens are (next-auth/jwt's encode/decode, a JWE), but under
 * a distinct `salt` so a state token can never be confused with (or substituted for) a
 * real bearer session token even if one were replayed in the wrong place.
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

/** The installed app's own redirect (`Linking.createURL("auth")` with scheme `character-chatbot-mobile`). */
const APP_REDIRECT_URI = "character-chatbot-mobile://auth";

/** Localhost or a private-network IPv4 address. */
const LOCAL_HOST =
  /^(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

/** Expo Go dev hosts: a local address, or a label under Expo's tunnel domain. */
function isExpoGoHost(hostname: string): boolean {
  return LOCAL_HOST.test(hostname) || /^[a-z0-9-]+\.exp\.direct$/.test(hostname);
}

/**
 * True when `value` is a redirect URI this bridge is willing to hand a bearer token to: the
 * app's exact URI, or Expo Go's `exp://<dev host>/--/auth`. A bare scheme or `exp://` prefix
 * match would send the token to any host (or any app that registered the scheme).
 */
export function isAllowedRedirectUri(value: string): boolean {
  if (value === APP_REDIRECT_URI) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "exp:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/--/auth" &&
      isExpoGoHost(url.hostname)
    );
  } catch {
    return false;
  }
}

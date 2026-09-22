/**
 * First leg of the mobile Google sign-in bridge. Plain Expo Go has no supported way to run
 * Google's own native sign-in SDK (it requires a custom dev client) and Google won't accept
 * an `exp://` redirect URI directly on its OAuth consent screen, so the mobile app instead
 * opens this page in a browser tab (expo-web-browser's `openAuthSessionAsync`), which runs
 * the real OAuth flow against this backend's own stable HTTPS domain — Google only ever sees
 * this server as the client, never the app itself. See mobile-google-callback.ts for the
 * second leg, and character-chatbot-mobile's CLAUDE.md for why this exists instead of
 * `@react-native-google-signin/google-signin`.
 *
 * Deliberately placed under /api/auth/ so proxy.ts's origin/API-key check doesn't apply to
 * it (see proxy.ts's own `/api/auth/` bypass comment) — same as every other NextAuth route,
 * this endpoint has to be reachable by a top-level browser navigation with no first-party
 * Origin/Referer at all. The real guard here is `redirectUri` validation below: without it, a
 * crafted link to this endpoint could walk a victim through a real Google sign-in and then
 * hand the resulting bearer token to an attacker-controlled redirect target instead of this
 * app. Restricting the scheme to `exp://` (Expo Go, dev only) or this app's own registered
 * custom scheme (`character-chatbot-mobile://`, see app.json's `scheme`) closes that off for
 * production; the `exp://` allowance is a narrow, dev-only residual (see README/CLAUDE.md if
 * this ever needs tightening further).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { signMobileAuthState } from "../../../src/utils/mobileAuthState";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";
import { withRequestLog } from "../../../src/utils/withRequestLog";

const mobileGoogleStartRateLimit = createRateLimiter({
  name: "mobile-google-start",
  max: 10,
  message: "Too many sign-in attempts from this IP, please try again later.",
});

const ALLOWED_REDIRECT_PREFIXES = ["exp://", "character-chatbot-mobile://"];

/** True when `value` is a redirect URI this bridge is willing to hand a bearer token to. */
function isAllowedRedirectUri(value: string): boolean {
  return ALLOWED_REDIRECT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/** Next.js API route handler that starts the mobile Google sign-in bridge (see module doc above). */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(mobileGoogleStartRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const redirectUri = req.query.redirect_uri;
  if (typeof redirectUri !== "string" || !isAllowedRedirectUri(redirectUri)) {
    res.status(400).send("Invalid redirect_uri");
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (!clientId || !nextAuthUrl) {
    logEvent("error", "mobile_google_start_misconfigured", "Missing Google/NextAuth env vars", {});
    res.status(500).send("Sign-in is not configured");
    return;
  }

  const state = await signMobileAuthState(redirectUri);
  const callbackUrl = `${nextAuthUrl}/api/auth/mobile-google-callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  logEvent("info", "mobile_google_start", "Starting mobile Google sign-in", sanitizeLogMeta({}));
  res.redirect(302, authUrl.toString());
}

export default withRequestLog(handler);

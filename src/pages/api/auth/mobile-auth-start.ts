/**
 * Generic mobile sign-in bridge — start leg. Plain Expo Go has no supported native
 * Google Sign-In path, and a magic-link email flow inherently needs a real browser tab
 * regardless of platform, so this opens the app's own NextAuth sign-in page — the exact
 * same page/form a web visitor already uses, for either Google or magic-link email — in
 * a browser tab (expo-web-browser's `openAuthSessionAsync`), rather than reimplementing
 * either provider's flow ourselves. Whichever provider the visitor completes, NextAuth's
 * own callback routes (`/api/auth/callback/google`, `/api/auth/callback/email` —
 * unchanged) handle it and redirect through mobile-auth-complete.ts (via the
 * `callbackUrl` set up below), which mints the bearer token from the resulting session.
 * See mobile-auth-complete.ts for the second leg, and character-chatbot-mobile's
 * CLAUDE.md for why this exists instead of a native SDK.
 *
 * Replaces the earlier mobile-google-start.ts/-callback.ts pair, which hand-rolled the
 * Google OAuth code exchange itself (google-auth-library's OAuth2Client) — duplicating
 * logic NextAuth's own configured Google provider already does for web. This version
 * has zero provider-specific code: it also automatically inherits whatever
 * authOptions.ts's environment-based provider swapping already does (e.g. the
 * preview-stub Credentials provider on Vercel Preview), with no special-casing needed.
 *
 * Deliberately placed under /api/auth/ so proxy.ts's origin/API-key check doesn't apply
 * to it (see proxy.ts's own `/api/auth/` bypass comment) — same as every other NextAuth
 * route, this endpoint has to be reachable by a top-level browser navigation with no
 * first-party Origin/Referer at all. The real guard here is `redirectUri` validation
 * below: without it, a crafted link to this endpoint could walk a victim through a real
 * sign-in and then hand the resulting bearer token to an attacker-controlled redirect
 * target instead of this app. Restricting the scheme to `exp://` (Expo Go, dev only) or
 * this app's own registered custom scheme (`character-chatbot-mobile://`, see app.json's
 * `scheme`) closes that off for production; the `exp://` allowance is a narrow, dev-only
 * residual (see README/CLAUDE.md if this ever needs tightening further).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { signMobileAuthState } from "../../../utils/mobileAuthState";
import { getRequestBaseUrl } from "../../../utils/requestBaseUrl";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/withRequestLog";

const mobileAuthStartRateLimit = createRateLimiter({
  name: "mobile-auth-start",
  max: 10,
  message: "Too many sign-in attempts from this IP, please try again later.",
});

const ALLOWED_REDIRECT_PREFIXES = ["exp://", "character-chatbot-mobile://"];

/** True when `value` is a redirect URI this bridge is willing to hand a bearer token to. */
function isAllowedRedirectUri(value: string): boolean {
  return ALLOWED_REDIRECT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/** Next.js API route handler that starts the mobile sign-in bridge (see module doc above). */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(mobileAuthStartRateLimit, req, res))) return;

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

  // NEXTAUTH_URL isn't set in this app's production deployment (web's own sign-in
  // already relies on NextAuth's own host-header inference) — fall back to the same
  // inference here rather than requiring a new env var just for this bridge.
  const nextAuthUrl = process.env.NEXTAUTH_URL || getRequestBaseUrl(req);
  const state = await signMobileAuthState(redirectUri);
  const completeUrl = `${nextAuthUrl}/api/auth/mobile-auth-complete?state=${encodeURIComponent(state)}`;

  // NextAuth persists this callbackUrl in its own cookie (or embeds it directly in the
  // magic-link email, for the email provider) and carries it through the entire
  // sign-in flow — including an OAuth provider's round trip to Google and back — before
  // finally redirecting here once a real session exists. Same-origin, so it passes
  // NextAuth's default redirect callback (no custom `redirect` callback is defined in
  // authOptions.ts) with no extra configuration needed.
  const signInUrl = `${nextAuthUrl}/api/auth/signin?callbackUrl=${encodeURIComponent(completeUrl)}`;

  logEvent("info", "mobile_auth_start", "Starting mobile sign-in bridge", sanitizeLogMeta({}));
  res.redirect(302, signInUrl);
}

export default withRequestLog(handler);

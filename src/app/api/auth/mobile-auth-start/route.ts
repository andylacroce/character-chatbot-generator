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
 * This bridge has zero provider-specific code: it inherits whatever authOptions.ts's
 * environment-based provider swapping does (e.g. the preview-stub Credentials provider on
 * Vercel Preview), with no special-casing.
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

import type { NextRequest } from "next/server";
import {
  isAllowedRedirectUri,
  signMobileAuthState,
} from "../../../../utils/account/mobileAuthState";
import { getRequestBaseUrl } from "../../../../utils/server/requestBaseUrl";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";
import { withRoute } from "../../../../utils/server/withRoute";

const LIMIT = {
  name: "mobile-auth-start",
  max: 10,
  message: "Too many sign-in attempts from this IP, please try again later.",
};

/**
 * Starts the mobile sign-in bridge (see the module doc above).
 *
 * @swagger
 * /auth/mobile-auth-start:
 *   get:
 *     summary: Start the mobile sign-in bridge
 *     description: >
 *       Opens the app's own sign-in page for the mobile app: redirects (302) to
 *       /api/auth/signin with a callback through /auth/mobile-auth-complete. Only the
 *       installed app's redirect URI, or an Expo Go dev URI, is accepted.
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: redirect_uri
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect to the sign-in page
 *       400:
 *         description: redirect_uri is missing or not an allowed app redirect
 *       429:
 *         description: Rate limit exceeded
 */
export const GET = withRoute(LIMIT, async (req: NextRequest) => {
  const redirectUri = req.nextUrl.searchParams.get("redirect_uri");
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return new Response("Invalid redirect_uri", { status: 400 });
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
  return new Response(null, { status: 302, headers: { Location: signInUrl } });
});

/**
 * Generic mobile sign-in bridge — complete leg. See mobile-auth-start.ts's doc comment
 * for the full picture. NextAuth's own `/api/auth/callback/google` or
 * `/api/auth/callback/email` routes (unchanged) redirect here — via the `callbackUrl`
 * mobile-auth-start.ts set up — once the browser holds a fresh, real NextAuth session
 * cookie for whichever provider the visitor just completed. This route's only job is to
 * read that session and mint a bearer JWT for the mobile app (the same `next-auth/jwt`
 * `encode()` that produces the web's session cookie — see getSessionUserId.ts's doc
 * comment on why both decode identically), then redirect back into the app's own
 * `exp://`/custom-scheme redirect URI with that token. expo-web-browser's
 * `openAuthSessionAsync` (started by the mobile app) is what's actually watching for
 * that final redirect — this response is otherwise just an ordinary browser-facing
 * redirect.
 */

import type { NextRequest } from "next/server";
import { getToken, encode } from "next-auth/jwt";
import { verifyMobileAuthState } from "../../../../utils/account/mobileAuthState";
import { logEvent, sanitizeLogMeta } from "../../../../utils/logger";
import { withRoute } from "../../../../utils/server/withRoute";

const LIMIT = {
  name: "mobile-auth-complete",
  max: 10,
  message: "Too many requests from this IP, please try again later.",
};

/** Builds the 302 back into the app's own redirect URI, with `params` set on it. */
function redirectTo(redirectUri: string, params: Record<string, string>): Response {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

/**
 * Finishes the mobile sign-in bridge (see the module doc above).
 *
 * @swagger
 * /auth/mobile-auth-complete:
 *   get:
 *     summary: Finish the mobile sign-in bridge
 *     description: >
 *       Reads the web session the sign-in just created and redirects (302) back into the
 *       app's redirect URI with a bearer `token`, or with an `error` (`not_signed_in`,
 *       `server_misconfigured`) when no session exists.
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: state
 *         required: true
 *         description: The signed state minted by /auth/mobile-auth-start
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect into the app with a token or an error
 *       400:
 *         description: Missing, invalid or expired state
 *       429:
 *         description: Rate limit exceeded
 */
export const GET = withRoute(LIMIT, async (req: NextRequest) => {
  const state = req.nextUrl.searchParams.get("state");
  if (!state) {
    return new Response("Missing state", { status: 400 });
  }
  const verifiedState = await verifyMobileAuthState(state);
  if (!verifiedState) {
    logEvent("info", "mobile_auth_complete_invalid_state", "Rejected invalid/expired state");
    return new Response("Your sign-in link has expired. Please try again.", { status: 400 });
  }
  const { redirectUri } = verifiedState;

  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    logEvent("error", "mobile_auth_complete_misconfigured", "Missing NEXTAUTH_SECRET", {});
    return redirectTo(redirectUri, { error: "server_misconfigured" });
  }

  // Reads the session cookie NextAuth's own callback route just set on this same
  // request — the same helper getSessionUserId.ts wraps for reading either a web
  // session cookie or a mobile bearer token; here it's always the cookie branch, since
  // this request arrives as an ordinary browser navigation.
  const sessionToken = await getToken({ req, secret: nextAuthSecret });
  if (!sessionToken?.sub) {
    // Reaching this endpoint without a valid session means sign-in didn't actually
    // complete (e.g. the visitor navigated here directly, or a magic link expired) —
    // hand back a clear error rather than a token-shaped success.
    return redirectTo(redirectUri, { error: "not_signed_in" });
  }

  const bearerToken = await encode({
    token: {
      sub: sessionToken.sub,
      email: typeof sessionToken.email === "string" ? sessionToken.email : null,
      name: typeof sessionToken.name === "string" ? sessionToken.name : null,
    },
    secret: nextAuthSecret,
  });

  logEvent("info", "mobile_auth_complete", "Mobile sign-in succeeded", sanitizeLogMeta({}));

  return redirectTo(redirectUri, { token: bearerToken });
});

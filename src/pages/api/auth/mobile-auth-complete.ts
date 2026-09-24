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

import type { NextApiRequest, NextApiResponse } from "next";
import { getToken, encode } from "next-auth/jwt";
import { verifyMobileAuthState } from "../../../utils/mobileAuthState";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withRequestLog } from "../../../utils/withRequestLog";

const mobileAuthCompleteRateLimit = createRateLimiter({
  name: "mobile-auth-complete",
  max: 10,
  message: "Too many requests from this IP, please try again later.",
});

/** Redirects back into the app's own redirect URI with an `error` query param set. */
function redirectWithError(res: NextApiResponse, redirectUri: string, error: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  res.redirect(302, url.toString());
}

/** Next.js API route handler for the mobile sign-in bridge's complete leg (see module doc above). */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(mobileAuthCompleteRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { state } = req.query;
  if (typeof state !== "string") {
    res.status(400).send("Missing state");
    return;
  }
  const verifiedState = await verifyMobileAuthState(state);
  if (!verifiedState) {
    logEvent("info", "mobile_auth_complete_invalid_state", "Rejected invalid/expired state");
    res.status(400).send("Your sign-in link has expired. Please try again.");
    return;
  }
  const { redirectUri } = verifiedState;

  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    logEvent("error", "mobile_auth_complete_misconfigured", "Missing NEXTAUTH_SECRET", {});
    redirectWithError(res, redirectUri, "server_misconfigured");
    return;
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
    redirectWithError(res, redirectUri, "not_signed_in");
    return;
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

  const url = new URL(redirectUri);
  url.searchParams.set("token", bearerToken);
  res.redirect(302, url.toString());
}

export default withRequestLog(handler);

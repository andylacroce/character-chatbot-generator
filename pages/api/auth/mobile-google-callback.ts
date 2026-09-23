/**
 * Second leg of the mobile Google sign-in bridge — see mobile-google-start.ts's doc comment
 * for the full picture. Google redirects here (a top-level browser navigation, this app's own
 * stable HTTPS domain) with an authorization `code` and the `state` minted by the start leg.
 * This handler exchanges the code for Google tokens, verifies the resulting `id_token`,
 * finds-or-creates a `users` row the same way the web's own Google sign-in does (matched by
 * email, matching authOptions.ts's `allowDangerousEmailAccountLinking` policy so a person who
 * signs in from both platforms lands on one account), mints a bearer JWT with next-auth/jwt's
 * `encode()` (no DB row is required — same degrade-gracefully shape as the rest of this app;
 * see the `userId` fallback below), and 302s back into the app's own `exp://` or custom-scheme
 * redirect URI with that token as a query param. expo-web-browser's `openAuthSessionAsync`
 * (started by the mobile app) is what's actually watching for that final redirect — this
 * response is otherwise just an ordinary browser-facing HTML/redirect page.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { encode } from "next-auth/jwt";
import { getDb } from "../../../src/db/client";
import { users } from "../../../src/db/schema";
import { verifyMobileAuthState } from "../../../src/utils/mobileAuthState";
import { createRateLimiter, applyRateLimit } from "../../../src/utils/rateLimit";
import { getRequestBaseUrl } from "../../../src/utils/requestBaseUrl";
import { logEvent, sanitizeLogMeta } from "../../../src/utils/logger";
import { withRequestLog } from "../../../src/utils/withRequestLog";

const mobileGoogleCallbackRateLimit = createRateLimiter({
  name: "mobile-google-callback",
  max: 10,
  message: "Too many sign-in attempts from this IP, please try again later.",
});

/** Finds this email's existing users.id, or creates a new row and returns its id. */
async function findOrCreateUserId(
  email: string,
  name: string | null,
  image: string | null,
): Promise<string> {
  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing[0]) return existing[0].id;
  const inserted = await db
    .insert(users)
    .values({ email, name, image })
    .returning({ id: users.id });
  return inserted[0].id;
}

/** Redirects back into the app's own redirect URI with an `error` query param set. */
function redirectWithError(res: NextApiResponse, redirectUri: string, error: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  res.redirect(302, url.toString());
}

/** Next.js API route handler for the mobile Google sign-in bridge's callback leg (see module doc above). */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(mobileGoogleCallbackRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { code, state, error: googleError } = req.query;

  if (typeof state !== "string") {
    res.status(400).send("Missing state");
    return;
  }
  const verifiedState = await verifyMobileAuthState(state);
  if (!verifiedState) {
    logEvent("info", "mobile_google_callback_invalid_state", "Rejected invalid/expired state");
    res.status(400).send("Your sign-in link has expired. Please try again.");
    return;
  }
  const { redirectUri } = verifiedState;

  if (typeof googleError === "string") {
    logEvent(
      "info",
      "mobile_google_callback_denied",
      "Google returned an error",
      sanitizeLogMeta({ error: googleError }),
    );
    redirectWithError(res, redirectUri, googleError);
    return;
  }

  if (typeof code !== "string") {
    redirectWithError(res, redirectUri, "missing_code");
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!clientId || !clientSecret || !nextAuthSecret) {
    logEvent("error", "mobile_google_callback_misconfigured", "Missing required env vars", {});
    redirectWithError(res, redirectUri, "server_misconfigured");
    return;
  }

  try {
    // Must match mobile-google-start.ts's callbackUrl exactly (Google validates the
    // redirect_uri identically across the auth request and this token exchange) — same
    // NEXTAUTH_URL-or-host-header fallback as that leg.
    const nextAuthUrl = process.env.NEXTAUTH_URL || getRequestBaseUrl(req);
    const callbackUrl = `${nextAuthUrl}/api/auth/mobile-google-callback`;
    const client = new OAuth2Client(clientId, clientSecret, callbackUrl);
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      redirectWithError(res, redirectUri, "no_id_token");
      return;
    }

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified || !payload.sub) {
      redirectWithError(res, redirectUri, "unverified_account");
      return;
    }

    // Same degrade-gracefully shape as the rest of this app (see authOptions.ts's own
    // adapter-optional doc comment): without a database, sign-in still works, keyed on
    // Google's own stable `sub` instead of a persisted users.id — bots/messages/leaderboard
    // identity simply won't persist across sessions in that deployment, same as today.
    const userId = process.env.DATABASE_URL
      ? await findOrCreateUserId(payload.email, payload.name ?? null, payload.picture ?? null)
      : payload.sub;

    const bearerToken = await encode({
      token: { sub: userId, email: payload.email, name: payload.name ?? null },
      secret: nextAuthSecret,
    });

    logEvent(
      "info",
      "mobile_google_signin",
      "Mobile Google sign-in succeeded",
      sanitizeLogMeta({}),
    );

    const url = new URL(redirectUri);
    url.searchParams.set("token", bearerToken);
    res.redirect(302, url.toString());
  } catch (err) {
    logEvent(
      "error",
      "mobile_google_callback_failed",
      "Failed to complete mobile Google sign-in",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    redirectWithError(res, redirectUri, "signin_failed");
  }
}

export default withRequestLog(handler);

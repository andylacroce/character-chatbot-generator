/**
 * Derives `${protocol}://${host}` from the incoming request's forwarded headers — the
 * same host inference NextAuth itself falls back to when `NEXTAUTH_URL` isn't set
 * (this app's production deployment doesn't set it; web's own sign-in already relies
 * on this inference working). Used by the mobile Google sign-in bridge
 * (mobile-google-start.ts/-callback.ts), which needs to build an absolute callback URL
 * itself rather than going through NextAuth's own internal URL resolution.
 *
 * Trusting `x-forwarded-proto`/`x-forwarded-host` here is the same tradeoff
 * getClientIp() already documents for `x-forwarded-for`: correct because Vercel's edge
 * sets these itself rather than forwarding a client-supplied value.
 */

import type { NextApiRequest } from "next";

/** Derives `${protocol}://${host}` from the request's forwarded headers (see module doc above). */
export function getRequestBaseUrl(req: NextApiRequest): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    (typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : null) ?? "https";
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (typeof forwardedHost === "string" ? forwardedHost : req.headers.host) ?? "";
  return `${protocol}://${host}`;
}

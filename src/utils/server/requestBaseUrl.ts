/**
 * Derives `${protocol}://${host}` from the incoming request's forwarded headers — the
 * same host inference NextAuth itself falls back to when `NEXTAUTH_URL` isn't set
 * (this app's production deployment doesn't set it; web's own sign-in already relies
 * on this inference working). Used by the generic mobile sign-in bridge
 * (mobile-auth-start.ts/-complete.ts), which needs to build an absolute callback URL
 * itself rather than going through NextAuth's own internal URL resolution.
 *
 * Trusting `x-forwarded-proto`/`x-forwarded-host` here is the same tradeoff
 * getClientIp() already documents for `x-forwarded-for`: correct because Vercel's edge
 * sets these itself rather than forwarding a client-supplied value.
 */

/** Derives `${protocol}://${host}` from the request's forwarded headers (see module doc above). */
export function getRequestBaseUrl(req: Request): string {
  const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return `${protocol}://${host}`;
}

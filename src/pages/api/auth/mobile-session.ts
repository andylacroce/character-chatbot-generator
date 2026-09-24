/**
 * Lets the mobile app resolve who a bearer token belongs to, for display purposes only
 * (e.g. "Signed in as jane@example.com"). next-auth v4's JWT session tokens are
 * encrypted (a JWE), not just signed, so there's no client-side decode path for the
 * token minted by mobile-auth-complete.ts — this route is the one place that can
 * read it. Deliberately not folded into getSessionUserId.ts: that helper only ever
 * returns `sub`, which is all every other route needs, while this one also needs
 * `email`/`name` off the same token for the mobile client to render.
 *
 * Lives under /api/auth/ so proxy.ts's origin/API-key bypass for that path applies —
 * the bearer token itself is the auth boundary here, the same as every other route
 * that calls getSessionUserId/getToken.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { createRateLimiter, applyRateLimit } from "../../../utils/rateLimit";
import { withRequestLog } from "../../../utils/withRequestLog";

/** Rate limiter: 10 requests per minute per IP, matching the other mobile-auth-* routes. */
const mobileSessionRateLimit = createRateLimiter({
  name: "mobile-session",
  max: 10,
  message: "Too many requests from this IP, please try again later.",
});

/**
 * Next.js API route handler resolving the caller's bearer token to a display identity.
 *
 * @swagger
 * /auth/mobile-session:
 *   get:
 *     summary: Resolve the caller's bearer token to a display identity
 *     description: >
 *       Returns null fields for a missing/invalid/expired token rather than an error —
 *       the mobile client treats that the same as "signed out".
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: The token's identity, or all-null fields if not signed in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   nullable: true
 *                 email:
 *                   type: string
 *                   nullable: true
 *                 name:
 *                   type: string
 *                   nullable: true
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(mobileSessionRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  res.status(200).json({
    userId: typeof token?.sub === "string" ? token.sub : null,
    email: typeof token?.email === "string" ? token.email : null,
    name: typeof token?.name === "string" ? token.name : null,
  });
}

export default withRequestLog(handler);

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

import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { withRoute } from "../../../../utils/server/withRoute";

const LIMIT = {
  name: "mobile-session",
  max: 10,
  message: "Too many requests from this IP, please try again later.",
};

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
export const GET = withRoute(LIMIT, async (req: NextRequest) => {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return Response.json({
    userId: typeof token?.sub === "string" ? token.sub : null,
    email: typeof token?.email === "string" ? token.email : null,
    name: typeof token?.name === "string" ? token.name : null,
  });
});

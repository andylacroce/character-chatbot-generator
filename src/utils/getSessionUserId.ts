/**
 * Resolves the signed-in user's id for a Pages Router API request, or null if the
 * caller is anonymous. Every route that persists per-user data should derive its
 * user id from this — never from a client-supplied field — the same trust boundary
 * proxy.ts already enforces for request origin.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/authOptions";

export async function getSessionUserId(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<string | null> {
  const session = await getServerSession(req, res, authOptions);
  return session?.user?.id ?? null;
}

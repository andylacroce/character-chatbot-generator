/**
 * Gates access to the internal `/admin` stats view. Fails closed: with no `ADMIN_EMAILS`
 * configured, nobody is admin — the opposite default of every other optional feature in
 * this app, because this one grants read access to other users' aggregate activity rather
 * than an optional convenience for the caller's own data.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/authOptions";

/**
 * Returns true only for a signed-in session whose email is in `ADMIN_EMAILS` AND whose
 * sign-in was cryptographically real. On a Vercel Preview deployment, Auth.js swaps Google
 * out for a stub Credentials provider that issues a session for any typed-in email with no
 * verification at all (see authOptions.ts) — without this environment check, anyone who
 * knows (or guesses) the admin's email could self-assign it on a preview URL and pass the
 * check below. Google OAuth can't succeed on preview anyway (its redirect URI has no
 * wildcard support), so this only ever excludes the one path that was never trustworthy.
 */
export async function isAdmin(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  if (process.env.VERCEL_ENV === "preview") return false;

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length === 0) return false;

  const session = await getServerSession(req, res, authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  return !!email && adminEmails.includes(email);
}

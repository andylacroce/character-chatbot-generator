/**
 * Gates access to the internal `/admin` stats view. Fails closed: with no `ADMIN_EMAILS`
 * configured, nobody is admin — the opposite default of every other optional feature in
 * this app, because this one grants read access to other users' aggregate activity rather
 * than an optional convenience for the caller's own data.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/authOptions";

/**
 * Shared admin check behind both `isAdmin` (Pages API routes) and `isAdminSession` (App
 * Router server components) — same env/preview short-circuit and email match, just a
 * different way of obtaining the session. `getSession` is only invoked once those cheap
 * checks pass, so neither caller pays for a session lookup when nobody could be admin
 * anyway (no `ADMIN_EMAILS`, or a Vercel Preview deployment — see the doc comment below).
 */
async function checkAdminEmail(
  getSession: () => Promise<Pick<Session, "user"> | null>,
): Promise<boolean> {
  if (process.env.VERCEL_ENV === "preview") return false;

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length === 0) return false;

  const session = await getSession();
  const email = session?.user?.email?.trim().toLowerCase();
  return !!email && adminEmails.includes(email);
}

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
  return checkAdminEmail(() => getServerSession(req, res, authOptions));
}

/**
 * App Router equivalent of `isAdmin`, for a Server Component (no req/res to pass) — used
 * by app/admin/page.tsx to 404 a non-admin before the stats view's shell ever renders,
 * rather than relying solely on the client-side check that used to be the only gate there.
 */
export async function isAdminSession(): Promise<boolean> {
  return checkAdminEmail(() => getServerSession(authOptions));
}

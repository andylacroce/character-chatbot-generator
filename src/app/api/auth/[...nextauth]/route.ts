/**
 * Auth.js (NextAuth v4) catch-all route: sign-in, callback, sign-out, session, CSRF.
 * Config lives in src/auth/authOptions.ts; this file just mounts it.
 */

import NextAuth from "next-auth";
import { authOptions } from "../../../../auth/authOptions";
import { withRoute } from "../../../../utils/server/withRoute";

const handler = withRoute(null, NextAuth(authOptions));

export { handler as GET, handler as POST };

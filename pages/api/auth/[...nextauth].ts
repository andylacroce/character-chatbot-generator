/**
 * Auth.js (NextAuth v4) catch-all route — sign-in, callback, sign-out, session, CSRF.
 * Config lives in src/auth/authOptions.ts; this file just mounts it.
 */

import NextAuth from "next-auth";
import { authOptions } from "../../../src/auth/authOptions";

export default NextAuth(authOptions);

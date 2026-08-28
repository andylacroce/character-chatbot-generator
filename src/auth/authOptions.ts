/**
 * NextAuth (v4) configuration: Google sign-in only, JWT sessions.
 *
 * The Drizzle adapter is only attached when DATABASE_URL is configured — same
 * degrade-gracefully shape as VERCEL_BLOB_READ_WRITE_TOKEN and the Upstash rate-limit
 * store elsewhere in this repo. Without it, sign-in still works (JWT session, no DB
 * write); with it, a `users`/`accounts` row is created/linked on first sign-in.
 */

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "../db/client";
import { users, accounts } from "../db/schema";

const adapter = process.env.DATABASE_URL
  ? DrizzleAdapter(getDb(), { usersTable: users, accountsTable: accounts })
  : undefined;

export const authOptions: NextAuthOptions = {
  adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};

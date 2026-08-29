/**
 * NextAuth (v4) configuration: Google + Facebook sign-in, JWT sessions.
 *
 * The Drizzle adapter is only attached when DATABASE_URL is configured — same
 * degrade-gracefully shape as VERCEL_BLOB_READ_WRITE_TOKEN and the Upstash rate-limit
 * store elsewhere in this repo. Without it, sign-in still works (JWT session, no DB
 * write); with it, a `users`/`accounts` row is created/linked on first sign-in — the
 * adapter's `accounts` table is keyed by (provider, provider_account_id), so Google and
 * Facebook coexist there without any provider-specific handling.
 *
 * Both providers' OAuth redirect URIs are exact-match only (no wildcards), so real
 * sign-in can only ever work on the one static production domain — not Vercel preview
 * deployments, whose URL changes on every push. On preview (VERCEL_ENV === "preview"
 * — set by Vercel itself, never client-controlled), both are swapped out entirely for
 * a stub Credentials provider: an unverified, ephemeral identity (no DB write —
 * NextAuth's adapter hooks aren't invoked for Credentials sign-ins anyway) good enough
 * to exercise signed-in UI on a preview deployment. Swapped, not added alongside —
 * neither has credentials configured on preview and would just fail if offered there.
 * With two real providers now available outside preview, `AuthControl.tsx` falls back to
 * Auth.js's own picker page instead of guessing which one the user wants.
 */

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import CredentialsProvider from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "../db/client";
import { users, accounts } from "../db/schema";

const adapter = process.env.DATABASE_URL
  ? DrizzleAdapter(getDb(), { usersTable: users, accountsTable: accounts })
  : undefined;

const isPreview = process.env.VERCEL_ENV === "preview";

const providers: NextAuthOptions["providers"] = isPreview
  ? [
    CredentialsProvider({
      id: "preview-stub",
      name: "Preview (no real login)",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        // Redundant guard: must never issue a session outside an actual Vercel
        // preview deployment, even if this were somehow reached another way.
        if (process.env.VERCEL_ENV !== "preview") return null;
        const email = credentials?.email?.trim().toLowerCase();
        if (!email) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  ]
  : [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
    }),
  ];

export const authOptions: NextAuthOptions = {
  adapter,
  providers,
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

/**
 * NextAuth (v4) configuration: Google sign-in, JWT sessions.
 *
 * The Drizzle adapter is only attached when DATABASE_URL is configured — same
 * degrade-gracefully shape as VERCEL_BLOB_READ_WRITE_TOKEN and the Upstash rate-limit
 * store elsewhere in this repo. Without it, sign-in still works (JWT session, no DB
 * write); with it, a `users`/`accounts` row is created/linked on first sign-in.
 *
 * Google's OAuth redirect URI is exact-match only (no wildcards), so real sign-in can
 * only ever work on the one static production domain — not Vercel preview deployments,
 * whose URL changes on every push. On preview (VERCEL_ENV === "preview" — set by Vercel
 * itself, never client-controlled), Google is swapped out entirely for a stub
 * Credentials provider: an unverified, ephemeral identity (no DB write — NextAuth's
 * adapter hooks aren't invoked for Credentials sign-ins anyway) good enough to exercise
 * signed-in UI on a preview deployment. Swapped, not added alongside — Google has no
 * client_id configured on preview and would just fail if offered there too.
 *
 * Facebook sign-in (issue #832) was built, shipped, then disabled here (issue #832
 * follow-up) — not a bug, a deliberate rollback. Meta's Publish flow gates any app
 * (regardless of which login product/use-case it registers, standard "Facebook Login"
 * included) behind Meta Business Portfolio verification, which in practice demands
 * formal business documents (EIN letter, business registration/license, articles of
 * incorporation, etc.) that an individual developer without a registered business
 * doesn't have. Without completing that, the app could only ever admit Facebook's own
 * added testers, never the general public — not an acceptable tradeoff for this app's
 * primary (Google) sign-in path to carry that dead weight. The code was removed rather
 * than left dark behind a flag: `FacebookProvider`, its CSP `form-action` entry, and its
 * account-linking rationale all only make sense together, and a disabled-but-present
 * provider is exactly the kind of speculative surface this repo avoids (see CLAUDE.md's
 * "don't design for hypothetical future requirements"). Re-adding it later — if EIN-based
 * business verification is completed, or Meta changes this requirement — means restoring
 * `next-auth/providers/facebook`, its two env vars, and the `https://www.facebook.com`
 * CSP `form-action` entry; git history for this file has the exact prior shape.
 *
 * The Google provider sets `allowDangerousEmailAccountLinking: true`. This mattered when
 * Facebook was also active (so the same person signing in with either provider landed on
 * one account instead of NextAuth's default OAuthAccountNotLinked error) and is left in
 * place now — harmless with a single provider, and avoids a churn revert if a second
 * provider is added again later. Without it, NextAuth refuses to link a new provider to
 * an existing `users` row sharing its email — a genuine account-takeover guard (see
 * next-auth's own callback-handler.ts), since a same-email match alone doesn't prove the
 * same person controls both accounts on an untrusted provider. Don't extend this flag to
 * a future provider without first confirming that provider verifies email ownership too.
 */

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
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
      // See the account-linking note above `providers` — deliberate, not a default.
      allowDangerousEmailAccountLinking: true,
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

/**
 * Drizzle schema for account persistence (Postgres via Neon).
 *
 * `users`/`accounts` are Auth.js's identity tables — enough for Google sign-in. No
 * `sessions` table: sessions use the JWT strategy, so Auth.js never calls the
 * adapter's session methods. No `verification_tokens` table either, since there's no
 * email/magic-link provider.
 *
 * `bots` persists a signed-in user's created characters server-side (phase 3b of
 * account persistence). `(user_id, name, environment)` is unique — recreating a
 * same-named character for the same user in the same environment updates the
 * existing row (see pages/api/bots.ts's upsert) rather than erroring, matching
 * "regenerate this character" UX.
 *
 * `environment` (here and nowhere else) walls off Production/Preview/Development
 * data within one shared database, rather than provisioning separate Neon branches
 * per environment — see src/utils/environment.ts. Deliberately not applied to
 * `users`/`accounts` (a signed-in identity is the same person regardless of which
 * environment they're using) or `avatar_cache` (an intentionally global,
 * environment-agnostic cost optimization, not user data).
 */

import { pgTable, text, timestamp, integer, primaryKey, jsonb, unique } from "drizzle-orm/pg-core";
import type { CharacterVoiceConfig } from "../utils/characterVoices";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const bots = pgTable(
  "bots",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    personality: text("personality").notNull(),
    avatarUrl: text("avatar_url"),
    gender: text("gender"),
    voiceConfig: jsonb("voice_config").$type<CharacterVoiceConfig | null>(),
    environment: text("environment").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("bots_user_name_env_unique").on(table.userId, table.name, table.environment)],
);

/**
 * Global avatar cache, keyed by lowercased character name — shared across every
 * user (and guests), not scoped to `bots`. Gemini image generation is comparatively
 * expensive, so a name generated once is reused by everyone from then on; this
 * intentionally trades per-user visual variety for cost. Only successful Gemini
 * generations are cached (see pages/api/generate-avatar.ts) — never the
 * `/silhouette.svg` fallback, so a transient generation failure doesn't
 * permanently deny a name a real portrait. `gender` is cached alongside the image
 * because it's produced by the same Claude prompt-generation step that a cache hit
 * skips entirely, and callers need it for voice selection.
 */
export const avatarCache = pgTable("avatar_cache", {
  characterName: text("character_name").primaryKey(),
  avatarUrl: text("avatar_url").notNull(),
  gender: text("gender"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

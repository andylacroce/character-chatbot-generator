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
 *
 * `messages` persists per-bot chat history (phase 3c) — see pages/api/chat.ts, which
 * becomes the source of truth for personality/history for a signed-in user's saved
 * character instead of trusting the client-supplied conversationHistory on every
 * request. `bots.summary`/`summarizedThroughMessageId` is the rolling summarization
 * checkpoint that keeps that source-of-truth switch cheap on long conversations.
 */

import { pgTable, text, timestamp, integer, serial, primaryKey, jsonb, unique } from "drizzle-orm/pg-core";
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
    // Rolling summarization checkpoint (phase 3c): `summary` folds in every message up to
    // and including `summarizedThroughMessageId`, so a chat turn only ever needs to
    // summarize the messages after that point, not the whole history from scratch. Both
    // null until a conversation first exceeds the summarization threshold.
    summary: text("summary"),
    summarizedThroughMessageId: integer("summarized_through_message_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("bots_user_name_env_unique").on(table.userId, table.name, table.environment)],
);

/**
 * Per-bot chat history (phase 3c). `id` is a serial int (not a uuid like the other
 * tables) specifically so it can double as the summarization checkpoint's ordering key —
 * `bots.summarizedThroughMessageId` is a plain "> this id" comparison. Not
 * environment-scoped directly: it inherits scoping through `botId`'s FK to an
 * already-environment-scoped `bots` row. Audio is deliberately never persisted per
 * message — see CLAUDE.md's account-persistence non-goals; it regenerates on demand from
 * the message text and the bot's stored `voiceConfig`.
 */
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  // Exactly the client's Message.sender: the bot's name for a bot reply, "User" for the
  // user's turn — stored verbatim rather than a generic role enum so no translation is
  // needed at either the read (client display) or write (chat.ts) boundary.
  sender: text("sender").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

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

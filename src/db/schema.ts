/**
 * Drizzle schema for account persistence (Postgres via Neon).
 *
 * `users`/`accounts` are Auth.js's identity tables — enough for Google sign-in. No
 * `sessions` table: sessions use the JWT strategy, so Auth.js never calls the
 * adapter's session methods. `verificationTokens` backs the magic-link (Email)
 * provider — see authOptions.ts — which does need adapter-persisted tokens even
 * though sessions themselves stay JWT-based.
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

import {
  pgTable,
  text,
  timestamp,
  integer,
  serial,
  primaryKey,
  jsonb,
  unique,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import type { CharacterVoiceConfig } from "../utils/characterVoices";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  // Distinct from `name` above (which Auth.js populates from the OAuth profile and
  // AuthControl.tsx uses only for the "Sign out (X)" label): this is what the user
  // explicitly typed in as the name they want a character to greet them by — see
  // pages/api/user-profile.ts and pages/api/chat.ts's greeting injection. Nullable,
  // purely additive; a guest's equivalent lives client-side only (localStorage key
  // "chatbot-user-name", see src/utils/storage.ts's known-keys doc in CLAUDE.md).
  preferredName: text("preferred_name"),
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

/**
 * Magic-link sign-in tokens (Auth.js Email provider). `(identifier, token)` composite
 * primary key matches Auth.js core's adapter contract exactly — `identifier` is the
 * email address, `token` the hashed one-time value sent in the link. Rows are
 * short-lived (consumed on first use, or left to expire per `EmailProvider`'s
 * `maxAge`) — nothing here needs environment scoping, same reasoning as `users`.
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
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
 *
 * `recognized` mirrors /api/validate-character's field of the same name: false when the
 * name isn't an actual character/person Claude has knowledge of (an original character,
 * described via the /api/generate-personality `description` flow instead). pages/api/chars.ts
 * filters the public gallery to `recognized = true` rows only — an original character's
 * name/portrait means something only to its own creator, unlike a famous name every visitor
 * would recognize, so it doesn't belong on a public "characters anyone can chat with" wall.
 * Defaults true so rows written before this column existed (all pre-dating the recognized/
 * unrecognized distinction) keep showing on the gallery rather than silently vanishing;
 * scripts/reclassify-avatar-cache.cjs can re-run the recognized classification over
 * existing rows for anyone who wants that historical cleanup.
 *
 * `displayName` is the properly-cased name as Claude itself produced it (generate-
 * personality's `correctedName`, e.g. "Richard III", "Joan of Arc") — captured once at
 * write time in pages/api/generate-avatar.ts's `cacheAvatar`, since that's the one place
 * the correct casing is actually known; `characterName` (the primary key) stays
 * lowercased so lookups are case-insensitive. Nullable: rows written before this column
 * existed fall back to pages/api/chars.ts's regex-based `toDisplayName` reconstruction,
 * which is necessarily lossier (it can't know a name is a Roman numeral or a proper
 * noun exception on its own) than the name Claude already generated correctly.
 */
export const avatarCache = pgTable("avatar_cache", {
  characterName: text("character_name").primaryKey(),
  avatarUrl: text("avatar_url").notNull(),
  gender: text("gender"),
  recognized: boolean("recognized").default(true).notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/**
 * A persistent list of character names known to fail either of validate-character.ts's
 * two independent hard-block checks — checked *before* ever calling Claude, so a name
 * already known to be a problem gets a fast, consistent block instead of a fresh,
 * non-deterministic re-classification every single time (see CLAUDE.md's "Character
 * validation" section for the incident this fixes — a name already public on the
 * Character Wall popping a fresh warning on a later launch). `characterName` stays
 * lowercased, same case-insensitive-lookup convention as `avatarCache.characterName`.
 * Intentionally global, not `environment`-scoped, same rationale as `avatarCache`: a
 * blocking concern about a name is the same fact in every environment.
 *
 * `category` distinguishes which of the two checks a row belongs to, since they need
 * different fast-path response shapes (see pages/api/validate-character.ts):
 * - `"copyright"`: an overridable-if-caught-fresh copyright/trademark "warning" that's
 *   been made permanent — the fast path responds with `warningLevel: "warning"` and
 *   `scrubbed: true`.
 * - `"content"`: the *never*-overridable checks — either the name itself is abusive
 *   (profane/slur/sexual), or it identifies a real, currently-living person with a
 *   serious, well-documented real-world criminal conviction/allegation (added
 *   2026-09-17 after a live report that a name like this had no guardrail at all —
 *   the character wall at /chars is public, and impersonating a living person with
 *   this kind of history is a legal/reputational risk independent of copyright).
 *   Deliberately excludes historical/deceased figures, however controversial, and
 *   ordinary celebrity/political controversy — only serious real-world criminal
 *   conduct by someone still alive today. The fast path responds with
 *   `blocked: true`. Defaults to `"copyright"` for rows written before this column
 *   existed, preserving their original (only) behavior.
 *
 * Rows are added two ways: automatically, the moment validate-character.ts gets a
 * "warning" or `blocked: true` classification from Claude for any name
 * (`source: "claude"`), and manually by an admin via the `/admin/moderation` panel
 * (`source: "admin"`, `pages/api/admin/blocklist.ts`) for a name Claude hasn't flagged
 * (yet) or a false positive an admin wants removed. Deleting a row (un-blocking a
 * name) is always a manual admin action — nothing here re-adds a row automatically
 * once removed, short of Claude flagging it again on a fresh attempt.
 */
export const characterBlocklist = pgTable("character_blocklist", {
  characterName: text("character_name").primaryKey(),
  displayName: text("display_name"),
  reason: text("reason"),
  source: text("source").notNull().default("claude"),
  category: text("category").notNull().default("copyright"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/**
 * The admin-managed counterpart to `characterBlocklist` above — a name here is
 * treated as copyright-safe (`warningLevel: "none"`) without ever calling Claude,
 * same fast-path shape as the blocklist but the opposite polarity. Distinct from (and
 * checked before) `src/utils/characterAllowlist.ts`'s static, hand-curated list
 * (reused from `src/data/characterNames.ts`) — this table exists specifically for a
 * name an admin wants to permanently allow that isn't on that static list (e.g. the
 * live report that motivated this table: "Alice Munro," a real person not in the
 * curated public-domain-characters list at all). Rows are always `source: "admin"` —
 * unlike the blocklist, nothing here is ever written automatically by Claude.
 * Managed alongside the blocklist on the same `/admin/moderation` page.
 */
export const characterAllowlist = pgTable("character_allowlist", {
  characterName: text("character_name").primaryKey(),
  displayName: text("display_name"),
  reason: text("reason"),
  source: text("source").notNull().default("admin"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/**
 * Append-only record of every "warning"-level copyright/trademark classification
 * Claude has ever returned from pages/api/validate-character.ts — deliberately NOT
 * deduplicated by name (unlike `characterBlocklist`/`characterAllowlist`, both
 * upsert-on-conflict tables that only ever hold a name's *current* state). Backs the
 * /admin/moderation page's "Recently warned, filterable by duration" panel: since a
 * name disappears from the blocklist the moment it's un-blocked or allowlisted, that
 * table alone can't answer "what has Claude warned about in the last day/week/month" —
 * this table's rows are never deleted or updated, so that history survives regardless
 * of whatever action was later taken. `id` (not `characterName`) is the primary key
 * for exactly this reason: the same name can legitimately appear more than once, e.g.
 * flagged, unblocked as a false positive, then genuinely re-flagged later.
 */
export const characterWarningLog = pgTable("character_warning_log", {
  id: serial("id").primaryKey(),
  characterName: text("character_name").notNull(),
  displayName: text("display_name"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/**
 * Append-only product-usage event log, backing the admin-only `/admin` stats view
 * (see pages/api/admin/stats.ts). Exists because most usage — guest sessions, which never
 * write to `bots`/`messages` at all since there's no account to attach a row to — is
 * otherwise completely invisible in this database; this is a deliberately small
 * alternative to a third-party analytics service, not a general-purpose event pipeline.
 * `environment`-scoped like `bots`, via getCurrentEnvironment() (src/utils/environment.ts),
 * so local/preview usage never pollutes production counts. `userId` is nullable (a guest
 * event) and `onDelete: "set null"` rather than `cascade` — deleting a user account should
 * never retroactively erase historical aggregate counts. Only a handful of low-frequency,
 * high-signal event names are ever written here (see src/utils/analytics.ts) — deliberately
 * excludes anything that scales with chat-message volume.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    environment: text("environment").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("analytics_events_name_created_idx").on(table.name, table.createdAt)],
);

/**
 * A signed-in user's personal best guessing-game streak — a precursor to the public,
 * cross-user leaderboard tracked as Phase 2 of issue #876 (not started; would add its
 * own `game_results` table plus `users.showOnLeaderboard`). `environment`-scoped like
 * `bots`/`analyticsEvents`, via getCurrentEnvironment(), so a local/preview play
 * session can never inflate a real user's production best. `(user_id, environment)` is
 * the primary key rather than a surrogate id: there is exactly one current best per
 * user per environment, upserted in place (see src/utils/gameHighScore.ts) rather than
 * appended to as a history. Guests have no row here at all — the game is fully
 * client-authoritative for them, same as everywhere else in this app (see gameToken.ts's
 * module doc) — so "no row" is exactly how the UI knows not to show a personal best.
 */
export const gameHighScores = pgTable(
  "game_high_scores",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    highScore: integer("high_score").notNull().default(0),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.environment] })],
);

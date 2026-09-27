/**
 * DB-backed persistence helpers for a signed-in user's saved character chat (phase 3c —
 * see CLAUDE.md's account-persistence section). All degrade gracefully (return null/[]/no-op)
 * for a guest, no DATABASE_URL, or any DB error, so pages/api/chat.ts can fall through to its
 * fully client-authoritative behavior without special-casing failures at each call site.
 */

import { and, asc, eq, gt } from "drizzle-orm";
import { logEvent, sanitizeLogMeta } from "./logger";
import { getCurrentEnvironment } from "./environment";
import { getDb } from "../db/client";
import { bots, messages as messagesTable, users } from "../db/schema";
import { sanitizeCharacterName } from "./security";

export type BotRow = typeof bots.$inferSelect;
export type MessageRow = typeof messagesTable.$inferSelect;

/**
 * Looks up a signed-in user's saved character by name, scoped to the current environment —
 * the same `(user_id, name, environment)` unique index pages/api/bots.ts relies on. Returns
 * null for a guest, no DATABASE_URL, no match (including a copyright-warning-override
 * character, which is never saved — see CopyrightWarningModal), or any DB error, so the
 * caller can fall through to today's fully client-authoritative behavior. Never throws.
 */
export async function lookupBot(userId: string, botName: string): Promise<BotRow | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const sanitizedName = sanitizeCharacterName(botName);
    if (!sanitizedName) return null;
    const rows = await getDb()
      .select()
      .from(bots)
      .where(
        and(
          eq(bots.userId, userId),
          eq(bots.name, sanitizedName),
          eq(bots.environment, getCurrentEnvironment()),
        ),
      );
    return rows[0] ?? null;
  } catch (err) {
    logEvent(
      "error",
      "chat_bot_lookup_failed",
      "Failed to look up bot for chat persistence",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return null;
  }
}

/**
 * Looks up a signed-in user's stored preferred name (see pages/api/user-profile.ts), or
 * null for a guest, no DATABASE_URL, no value set, or any DB error — same
 * never-throws/degrade-gracefully shape as lookupBot above.
 */
export async function lookupUserPreferredName(userId: string): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await getDb()
      .select({ preferredName: users.preferredName })
      .from(users)
      .where(eq(users.id, userId));
    return rows[0]?.preferredName ?? null;
  } catch (err) {
    logEvent(
      "error",
      "chat_user_name_lookup_failed",
      "Failed to look up user's preferred name",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return null;
  }
}

/**
 * Messages for a bot since the last summarization checkpoint (or all of them, if the
 * conversation has never been summarized), oldest first. Returns [] on any DB error so a
 * lookup failure degrades to an empty-history turn rather than failing the request.
 */
export async function fetchUnsummarizedMessages(
  botId: string,
  summarizedThroughMessageId: number | null,
): Promise<MessageRow[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await getDb()
      .select()
      .from(messagesTable)
      .where(
        summarizedThroughMessageId != null
          ? and(eq(messagesTable.botId, botId), gt(messagesTable.id, summarizedThroughMessageId))
          : eq(messagesTable.botId, botId),
      )
      .orderBy(asc(messagesTable.id));
  } catch (err) {
    logEvent(
      "error",
      "chat_unsummarized_fetch_failed",
      "Failed to fetch unsummarized messages",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return [];
  }
}

/**
 * Persists one chat turn (the user's message and the bot's reply) for a saved character.
 * Best-effort — a write failure here must never fail or discard an already-generated reply,
 * same resilience pattern as the TTS and avatar-cache persistence elsewhere in this API.
 */
async function persistChatTurn(
  botId: string,
  userMessage: string,
  botName: string,
  botReply: string,
  isIntro: boolean,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    // The intro flow's "Introduce yourself..." prompt is an internal mechanism to elicit an
    // introduction, not something the user typed — persist only the bot's actual
    // introduction, not a synthetic "User" turn that would misrepresent the transcript.
    const rows = isIntro
      ? [{ botId, sender: botName, text: botReply }]
      : [
          { botId, sender: "User", text: userMessage },
          { botId, sender: botName, text: botReply },
        ];
    await getDb().insert(messagesTable).values(rows);
  } catch (err) {
    logEvent(
      "error",
      "chat_persist_turn_failed",
      "Failed to persist chat turn",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

/** Persists a new rolling summarization checkpoint onto the bot's row. Best-effort. */
async function persistSummaryCheckpoint(
  botId: string,
  summary: string,
  throughMessageId: number,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await getDb()
      .update(bots)
      .set({ summary, summarizedThroughMessageId: throughMessageId, updatedAt: new Date() })
      .where(eq(bots.id, botId));
  } catch (err) {
    logEvent(
      "error",
      "chat_persist_summary_failed",
      "Failed to persist summary checkpoint",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
}

/**
 * Persists a completed chat turn and, if this turn advanced the summarization checkpoint,
 * that too. A no-op for a guest or unsaved character (`botRow` null). Never throws — both
 * underlying writes already catch and log their own errors.
 */
export async function finalizeChatPersistence(
  botRow: BotRow | null,
  userMessage: string,
  botName: string,
  botReply: string,
  checkpoint: { summary: string; throughMessageId: number } | null,
  isIntro: boolean,
): Promise<void> {
  if (!botRow) return;
  await persistChatTurn(botRow.id, userMessage, botName, botReply, isIntro);
  if (checkpoint) {
    await persistSummaryCheckpoint(botRow.id, checkpoint.summary, checkpoint.throughMessageId);
  }
}

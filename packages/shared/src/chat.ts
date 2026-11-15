import type { CharacterVoiceConfig, ChatMessage, ChatRequest } from "./types";

/** The hidden first turn that makes a fresh character introduce itself. Never shown or persisted as a user turn. */
export const INTRO_PROMPT = "Introduce yourself in 2 sentences or less.";

/** How many recent turns are sent as history; older ones are summarized server-side. */
const HISTORY_TURNS = 20;

/** Formats recent turns into the "User: "/"Bot: " lines `/api/chat` expects (never ChatMessage objects). */
export function formatChatHistory(messages: ChatMessage[], botName: string): string[] {
  return messages
    .slice(-HISTORY_TURNS)
    .map((m) => (m.sender === botName ? `Bot: ${m.text}` : `User: ${m.text}`));
}

/** Keeps only well-formed turns from untrusted input (local storage, `/api/messages`); anything else yields []. */
export function parseChatMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is ChatMessage =>
      m !== null &&
      typeof m === "object" &&
      typeof (m as ChatMessage).text === "string" &&
      typeof (m as ChatMessage).sender === "string",
  );
}

/** Server history wins only when it is longer than what this device already has (new device / cleared storage). */
export function longerHistory<T>(local: T[], server: T[]): T[] {
  return server.length > local.length ? server : local;
}

interface ChatRequestOptions {
  bot: { name: string; personality: string; personalitySignature?: string; gender?: string | null };
  voiceConfig: CharacterVoiceConfig;
  message: string;
  /** Turns so far; omitted for the intro. */
  history?: ChatMessage[];
  userName?: string;
  isIntro?: boolean;
}

/** Builds the `/api/chat` body; the intro is the same request with `INTRO_PROMPT`, no history, and `isIntro`. */
export function buildChatRequest({
  bot,
  voiceConfig,
  message,
  history = [],
  userName,
  isIntro,
}: ChatRequestOptions): ChatRequest {
  return {
    message,
    personality: bot.personality,
    ...(bot.personalitySignature ? { personalitySignature: bot.personalitySignature } : {}),
    botName: bot.name,
    gender: bot.gender ?? undefined,
    conversationHistory: formatChatHistory(history, bot.name),
    voiceConfig,
    userName,
    ...(isIntro ? { isIntro: true } : {}),
  };
}

/** Turns an `/api/chat` response into the bot's transcript turn; a missing or empty reply throws rather than rendering a blank bubble. */
export function chatReplyMessage(
  botName: string,
  response: { reply?: unknown; audioFileUrl?: string },
): ChatMessage & { audioFileUrl?: string } {
  if (typeof response.reply !== "string" || !response.reply) {
    throw new Error("Invalid chat response: missing reply");
  }
  return { sender: botName, text: response.reply, audioFileUrl: response.audioFileUrl };
}

interface RetryOptions {
  /** Extra attempts after the first. */
  retries?: number;
  /** Wait before the first retry; doubles each time. */
  delayMs?: number;
  /** Called before every attempt (0 is the first), so a UI can show "retrying". */
  onAttempt?: (attempt: number) => void;
}

/** An error for a non-OK HTTP response, carrying its `status` so retry policy can tell 4xx from 5xx. */
export function httpError(
  status: number,
  code?: string,
): Error & { status: number; code?: string } {
  return Object.assign(new Error(`HTTP ${status}`), { status, code });
}

/** The `/api/chat` 400 code meaning the persona must be re-signed (see `useChatSession`). */
export const PERSONA_UNSIGNED = "persona_unsigned";

/** The `/api/chat` 503 code meaning the daily spend cap is reached (see `spendGuard.ts`). */
export const SPEND_CAP = "spend_cap";

/** Worth retrying: network failures (no status) and 5xx, except the spend cap, which a retry cannot clear. A 4xx (validation, 429) fails the same way again and spends rate-limit budget. */
export function isRetryable(err: unknown): boolean {
  const { status, code } = (err ?? {}) as { status?: unknown; code?: unknown };
  return code !== SPEND_CAP && (typeof status !== "number" || status >= 500);
}

/** The one user-facing message for a failed send; never the response body (see `httpError`). */
export function chatErrorMessage(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status;
  if (status === 429) return "You are sending messages too quickly. Please wait and try again.";
  if ((err as { code?: unknown } | null)?.code === "persona_refused") {
    return "This character is no longer available.";
  }
  if ((err as { code?: unknown } | null)?.code === SPEND_CAP) {
    return "Chat is resting for today. Please try again tomorrow.";
  }
  if (status === 408) return "The server took too long to respond. Please try again.";
  return "Error sending message. Please try again.";
}

/** Runs a chat request, retrying network failures and 5xx with exponential backoff; the last error is rethrown. */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  { retries = 2, delayMs = 800, onAttempt }: RetryOptions = {},
): Promise<T> {
  let delay = delayMs;
  for (let attempt = 0; ; attempt++) {
    onAttempt?.(attempt);
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

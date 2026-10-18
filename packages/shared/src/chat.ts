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
  bot: { name: string; personality: string; gender?: string | null };
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

/** Runs a chat request, retrying transient failures with exponential backoff; the last error is rethrown. */
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
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

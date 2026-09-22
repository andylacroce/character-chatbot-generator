/**
 * Thin fetch wrapper for talking to the character-chatbot-generator backend.
 * Every POST needs `x-api-key` because React Native's fetch sends no
 * Origin/Referer header, so proxy.ts's browser-CSRF check always falls through
 * to the API-key branch for this client (see .env.example).
 */
import type {
  CharacterValidationResult,
  CharacterVoiceConfig,
  ChatRequest,
  ChatResponse,
  CharsResponse,
  GenerateAvatarRequest,
  GenerateAvatarResponse,
  GeneratePersonalityRequest,
  GeneratePersonalityResponse,
  GetVoiceConfigRequest,
  RandomCharacterResponse,
  ValidateCharacterRequest,
} from "character-chatbot-shared";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const API_SECRET = process.env.EXPO_PUBLIC_API_SECRET ?? "";

if (!API_BASE_URL) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL is not set — copy .env.example to .env");
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Calls a character-chatbot-generator API route and returns the parsed JSON body. */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (method !== "GET" && method !== "HEAD") {
    headers["x-api-key"] = API_SECRET;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(response.status, text || response.statusText);
  }
  return (await response.json()) as T;
}

/**
 * Resolves a backend-relative URL (e.g. `ChatResponse.audioFileUrl`, `Bot.avatarUrl`) to an
 * absolute one. Avatar URLs are sometimes already-absolute Blob storage links, so this is a
 * no-op for anything that isn't backend-relative.
 */
export function resolveApiUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path}`;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function generatePersonality(
  body: GeneratePersonalityRequest,
): Promise<GeneratePersonalityResponse> {
  return post("/api/generate-personality", body);
}

export function generateAvatar(body: GenerateAvatarRequest): Promise<GenerateAvatarResponse> {
  return post("/api/generate-avatar", body);
}

/** Defaults to fully-open (safe/unblocked/recognized) on failure — same fail-open as the server. */
export async function validateCharacter(name: string): Promise<CharacterValidationResult> {
  const body: ValidateCharacterRequest = { name };
  try {
    return await post("/api/validate-character", body);
  } catch {
    return { characterName: name, isPublicDomain: true, isSafe: true, warningLevel: "none" };
  }
}

export function getVoiceConfig(
  name: string,
  gender?: string | null,
): Promise<CharacterVoiceConfig> {
  const body: GetVoiceConfigRequest = gender ? { name, gender } : { name };
  return post("/api/get-voice-config", body);
}

/**
 * The shared package's ChatRequest mistypes two fields against what chat.ts actually reads:
 * `isIntro` (see chat.ts's req.body.isIntro) is missing entirely, and `conversationHistory`
 * is declared as `ChatMessage[]` but chat.ts feeds it straight into buildClaudeMessages(),
 * which expects pre-formatted "User: "/"Bot: " strings and calls .startsWith() on each
 * entry — sending raw {sender,text} objects 500s with "t.startsWith is not a function".
 * The web app converts before sending (see useChatController.ts's own conversationHistory
 * construction); ChatScreen's formatHistory() mirrors that.
 */
export type ChatRequestBody = Omit<ChatRequest, "conversationHistory"> & {
  isIntro?: boolean;
  conversationHistory?: string[];
};

export function sendChatMessage(body: ChatRequestBody): Promise<ChatResponse> {
  return post("/api/chat", body);
}

export function getRandomCharacter(): Promise<RandomCharacterResponse> {
  return apiFetch("/api/random-character");
}

export function getChars(limit: number, offset: number): Promise<CharsResponse> {
  return apiFetch(`/api/chars?limit=${limit}&offset=${offset}`);
}

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
  CharsGroup,
  CharsResponse,
  CharsSort,
  GameGiveUpResponse,
  GameHighScoreResponse,
  GameLeaderboardResponse,
  GameMessageRequest,
  GameMessageResponse,
  GameRoundResult,
  GuessWhoGiveUpResponse,
  GuessWhoHighScoreResponse,
  GuessWhoLeaderboardResponse,
  GuessWhoMessageRequest,
  GuessWhoMessageResponse,
  GuessWhoRoundResult,
  GenerateAvatarRequest,
  GenerateAvatarResponse,
  GeneratePersonalityRequest,
  GeneratePersonalityResponse,
  GetVoiceConfigRequest,
  LeaderboardSettingsRequest,
  LeaderboardSettingsResponse,
  PersistedBot,
  PersistedMessage,
  RandomCharacterResponse,
  UserProfile,
  ValidateCharacterRequest,
} from "character-chatbot-shared";
import {
  CAROUSEL_SAMPLE_PATH,
  parseGameRoundResult,
  parseGuessWhoRoundResult,
} from "character-chatbot-shared";
import { getCachedAuthToken } from "./authToken";
import { getGameGuestId } from "./gameGuest";

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
  const authToken = getCachedAuthToken();
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
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
  voiceContext?: string,
): Promise<CharacterVoiceConfig> {
  const body: GetVoiceConfigRequest = { name };
  if (gender) body.gender = gender;
  if (voiceContext?.trim()) body.voiceContext = voiceContext;
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

/** The landing carousel's random server-side sample of recent portraits. */
export async function getCarouselSample(): Promise<CharsResponse["characters"]> {
  const { characters } = await apiFetch<CharsResponse>(CAROUSEL_SAMPLE_PATH);
  return characters ?? [];
}

export function getChars(
  limit: number,
  offset: number,
  sort: CharsSort = "newest",
  group: CharsGroup = "none",
): Promise<CharsResponse> {
  return apiFetch(`/api/chars?limit=${limit}&offset=${offset}&sort=${sort}&group=${group}`);
}

/** Lists the signed-in user's persisted characters. Guests/signed-out get an empty list. */
export async function getPersistedBots(): Promise<PersistedBot[]> {
  const { bots } = await apiFetch<{ bots: PersistedBot[] }>("/api/bots");
  return bots;
}

/** Persists a created character for the signed-in user. No-ops server-side for guests. */
export function persistBot(bot: {
  name: string;
  personality: string;
  avatarUrl: string | null;
  gender: string | null;
  voiceConfig: CharacterVoiceConfig | null;
}): Promise<{ persisted: boolean }> {
  return post("/api/bots", bot);
}

/** Lists a signed-in user's persisted chat history for one saved character. */
export async function getPersistedMessages(botName: string): Promise<PersistedMessage[]> {
  const { messages } = await apiFetch<{ messages: PersistedMessage[] }>(
    `/api/messages?botName=${encodeURIComponent(botName)}`,
  );
  return messages;
}

/** Gets the signed-in user's preferred name. Guests/signed-out get `{ name: null }`. */
export function getUserProfile(): Promise<UserProfile> {
  return apiFetch("/api/user-profile");
}

/** Sets the signed-in user's preferred name. No-ops server-side for guests. */
export function saveUserProfile(name: string): Promise<{ persisted: boolean }> {
  return post("/api/user-profile", { name });
}

/** Deletes one saved chat by id, or (no id) clears every saved chat — see the backend's DELETE /api/bots. */
export function deleteSavedChats(id?: string): Promise<{ cleared: number }> {
  const query = id ? `?id=${encodeURIComponent(id)}` : "";
  return apiFetch(`/api/bots${query}`, { method: "DELETE" });
}

/**
 * Permanently deletes the signed-in account (see the backend's pages/api/account.ts). Sends
 * this device's guest identity too, so its anonymous game results are erased with it.
 */
export async function deleteAccount(): Promise<{ deleted: boolean }> {
  return apiFetch("/api/account", {
    method: "DELETE",
    headers: { "x-game-guest": await getGameGuestId() },
  });
}

/**
 * The message from an ApiError whose body is the backend's usual `{ error }` JSON, falling
 * back to `fallback` for anything else (network failure, HTML error page).
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.message) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    } catch {
      // Not JSON — use the fallback.
    }
  }
  return fallback;
}

/** Calls a guessing-game route with this device's guest identity (see gameGuest.ts). */
async function gameFetch<T>(path: string, body?: unknown): Promise<T> {
  const headers = { "x-game-guest": await getGameGuestId() };
  return body === undefined
    ? apiFetch<T>(path, { headers })
    : apiFetch<T>(path, { method: "POST", headers, body: JSON.stringify(body) });
}

/**
 * Starts a new guessing-game run. Called without `stream: true`: React Native's fetch can't
 * read a streamed body, so mobile waits for the plain JSON result instead of SSE progress.
 */
export async function startGame(): Promise<GameRoundResult> {
  return parseGameRoundResult(
    await gameFetch("/api/guess-who-next/start", {}),
    "/api/guess-who-next/start",
  );
}

/** Generates the next round after a correct guess (plain JSON, like startGame). */
export async function continueGame(gameToken: string): Promise<GameRoundResult> {
  return parseGameRoundResult(
    await gameFetch("/api/guess-who-next/continue", { gameToken }),
    "/api/guess-who-next/continue",
  );
}

/** Sends one game turn; the server decides whether it's a question or a guess. */
export function sendGameMessage(body: GameMessageRequest): Promise<GameMessageResponse> {
  return gameFetch("/api/guess-who-next/message", body);
}

/** Gives up the current run, revealing the hidden character. */
export function giveUpGame(gameToken: string): Promise<GameGiveUpResponse> {
  return gameFetch("/api/guess-who-next/give-up", { gameToken });
}

/** This account's or device's best streak (null when none is on record). */
export function getGameHighScore(): Promise<GameHighScoreResponse> {
  return gameFetch("/api/guess-who-next/high-score");
}

/** The public top-ten leaderboard. */
export function getLeaderboard(): Promise<GameLeaderboardResponse> {
  return apiFetch("/api/guess-who-next/leaderboard");
}

/** Whether this account or device can (and does) appear on the leaderboard. */
export function getLeaderboardSettings(): Promise<LeaderboardSettingsResponse> {
  return gameFetch("/api/guess-who-next/leaderboard-settings");
}

/** Joins the leaderboard under a moderated `name`, or leaves it. */
export function saveLeaderboardSettings(
  body: LeaderboardSettingsRequest,
): Promise<LeaderboardSettingsResponse> {
  return gameFetch("/api/guess-who-next/leaderboard-settings", body);
}

/**
 * Starts (or continues, carrying `usedNames`/`streak` forward) a "Guess Who" round.
 * Reuses the same `x-game-guest` guest identity as "Guess Who's Next" (see
 * gameGuest.ts) — one anonymous player id, shared across both games.
 */
export async function startGuessWhoRound(): Promise<GuessWhoRoundResult> {
  return parseGuessWhoRoundResult(
    await gameFetch("/api/guess-who/start", {}),
    "/api/guess-who/start",
  );
}

/** Generates the next round after a correct guess (plain JSON, like startGuessWhoRound). */
export async function continueGuessWho(guessWhoToken: string): Promise<GuessWhoRoundResult> {
  return parseGuessWhoRoundResult(
    await gameFetch("/api/guess-who/continue", { guessWhoToken }),
    "/api/guess-who/continue",
  );
}

/** Sends one turn of "Guess Who"'s chat; the server decides whether it's a question or a guess. */
export function sendGuessWhoMessage(
  body: GuessWhoMessageRequest,
): Promise<GuessWhoMessageResponse> {
  return gameFetch("/api/guess-who/message", body);
}

/** Gives up the current "Guess Who" run, revealing the hidden character. */
export function giveUpGuessWho(guessWhoToken: string): Promise<GuessWhoGiveUpResponse> {
  return gameFetch("/api/guess-who/give-up", { guessWhoToken });
}

/** This account's or device's best "Guess Who" streak (null when none is on record). */
export function getGuessWhoHighScore(): Promise<GuessWhoHighScoreResponse> {
  return gameFetch("/api/guess-who/high-score");
}

/** The public "Guess Who" top-ten leaderboard. */
export function getGuessWhoLeaderboard(): Promise<GuessWhoLeaderboardResponse> {
  return apiFetch("/api/guess-who/leaderboard");
}

/** Whether this account or device can (and does) appear on the "Guess Who" leaderboard. */
export function getGuessWhoLeaderboardSettings(): Promise<LeaderboardSettingsResponse> {
  return gameFetch("/api/guess-who/leaderboard-settings");
}

/** Joins the "Guess Who" leaderboard under a moderated `name`, or leaves it. */
export function saveGuessWhoLeaderboardSettings(
  body: LeaderboardSettingsRequest,
): Promise<LeaderboardSettingsResponse> {
  return gameFetch("/api/guess-who/leaderboard-settings", body);
}

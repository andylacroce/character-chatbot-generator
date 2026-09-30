/**
 * API request/response contract types shared between the Next.js backend
 * (character-chatbot-generator) and its clients (web, mobile). These mirror the
 * `@swagger` JSDoc annotations on each pages/api/*.ts handler — that file's
 * comment block is the source of truth; update both together if a contract changes.
 */

/** Google Cloud TTS voice selection, persisted per-character. */
export interface CharacterVoiceConfig {
  languageCodes: string[];
  name: string;
  ssmlGender: number;
  pitch?: number;
  rate?: number;
  type?: string;
}

/**
 * POST /api/get-voice-config request body. Missing from this file's swagger-mirroring
 * convention until now — pages/api/get-voice-config.ts exists and is real, it was just
 * never added here. Response body is a CharacterVoiceConfig.
 */
export interface GetVoiceConfigRequest {
  name: string;
  gender?: string | null;
  /** Generated personality/speaking-style context used only to cast a fitting voice. */
  voiceContext?: string;
}

/** One turn in a chat transcript, as sent in `conversationHistory` / rendered in the UI. */
export interface ChatMessage {
  sender: string;
  text: string;
}

/** A created/loaded character, as tracked client-side. */
export interface Bot {
  name: string;
  personality: string;
  avatarUrl: string;
  voiceConfig: CharacterVoiceConfig | null;
  gender?: string | null;
  /**
   * True when created past a copyright warning/caution the user chose to override.
   * Never persisted server-side — see generate-avatar's skipPersistence.
   */
  skipPersistence?: boolean;
}

/** POST /api/chat request body. */
export interface ChatRequest {
  message: string;
  personality?: string;
  botName?: string;
  gender?: string;
  /**
   * Pre-formatted "User: <text>" / "Bot: <text>" lines, oldest first — NOT ChatMessage
   * objects. pages/api/chat.ts feeds this straight into buildClaudeMessages(), which
   * calls .startsWith() on each entry; sending {sender,text} objects 500s with
   * "t.startsWith is not a function". See useChatController.ts's own conversion of
   * `messages` before it builds this field.
   */
  conversationHistory?: string[];
  voiceConfig: CharacterVoiceConfig;
  stream?: boolean;
  userName?: string;
  /**
   * Marks a hidden "introduce yourself" turn (see useChatController.ts's intro-generation
   * effect) — the synthetic prompt used to elicit it is never shown to the user or counted
   * as a real turn. Read as req.body.isIntro in pages/api/chat.ts.
   */
  isIntro?: boolean;
}

/** POST /api/chat JSON response (non-streaming). */
export interface ChatResponse {
  reply: string;
  audioFileUrl?: string;
  cached?: boolean;
  requestId?: string;
  done: true;
}

/** One `data:` frame of the /api/chat SSE stream. */
export type ChatStreamFrame =
  { chunk: string; done: false } | { reply: string; audioFileUrl?: string; done: true };

/**
 * POST /api/validate-character request body. Was mistyped here as `{characterName}` —
 * pages/api/validate-character.ts actually reads `req.body.name` (its own swagger
 * requestBody schema agrees: `required: [name]`). `characterName` only exists on the
 * *response* (CharacterValidationResult, below). Sending `{characterName}` 400s with
 * "Valid character name required".
 */
export interface ValidateCharacterRequest {
  name: string;
}

/**
 * POST /api/validate-character response. Three independent concerns in one call:
 * warningLevel (copyright/trademark, always overridable), blocked (abusive name,
 * never overridable), and recognized (does Claude actually know this name).
 * All fields default open (safe/false/true) on a server-side validation error.
 */
export interface CharacterValidationResult {
  characterName: string;
  isPublicDomain: boolean;
  isSafe: boolean;
  warningLevel: "none" | "caution" | "warning";
  reason?: string;
  suggestions?: string[];
  /** Hard, non-overridable block (abusive name, or a seriously criminal living person). */
  blocked?: boolean;
  /** False when the name is not an established character/person; creation is rejected. */
  recognized?: boolean;
  /** Already blocklisted or just removed from the public cache: hard stop, no override. */
  scrubbed?: boolean;
}

/** POST /api/generate-personality request body. */
export interface GeneratePersonalityRequest {
  name: string;
}

/** POST /api/generate-personality response. */
export interface GeneratePersonalityResponse {
  personality: string;
  /** `name` with spelling/casing corrected, or an existing similar character's exact name. */
  correctedName: string;
}

/** POST /api/generate-avatar request body. */
export interface GenerateAvatarRequest {
  name: string;
  skipPersistence?: boolean;
}

/** POST /api/generate-avatar response. */
export interface GenerateAvatarResponse {
  avatarUrl: string;
  gender?: string | null;
}

/** Taxonomy assigned to a character at creation time (packages/shared/src/characterCategories.ts). */
export type CharacterCategory =
  "history" | "mythology" | "literature" | "folklore" | "religion" | "other";

/** `sort` query param accepted by GET /api/chars. */
export type CharsSort = "newest" | "oldest" | "name-asc" | "name-desc";

/** `group` query param accepted by GET /api/chars — "category" makes it the primary ordering key. */
export type CharsGroup = "none" | "category";

/** One entry in the public /chars gallery (GET /api/chars). */
export interface CharacterEntry {
  name: string;
  avatarUrl: string;
  category: CharacterCategory;
}

/** GET /api/chars response. */
export interface CharsResponse {
  characters: CharacterEntry[];
  hasMore: boolean;
}

/** A signed-in user's persisted character (GET/POST /api/bots). */
export interface PersistedBot {
  id: string;
  name: string;
  personality: string;
  avatarUrl: string | null;
  gender: string | null;
  voiceConfig: CharacterVoiceConfig | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Maps a `GET /api/bots` row onto the Bot shape a client's "resume this character"
 * flow expects — mirrors the web app's own local copy in
 * app/components/ResumeBotDropdown.tsx (not yet migrated to import this one; see this
 * package's other not-yet-adopted-by-web exports).
 */
export function persistedBotToBot(bot: PersistedBot): Bot {
  return {
    name: bot.name,
    personality: bot.personality,
    avatarUrl: bot.avatarUrl || "/silhouette.svg",
    voiceConfig: bot.voiceConfig,
    gender: bot.gender,
  };
}

/** One row of GET /api/messages?botName=<name>. */
export interface PersistedMessage {
  id: number;
  sender: string;
  text: string;
  createdAt: string;
}

/** GET/POST /api/user-profile — the human visitor's own preferred name. */
export interface UserProfile {
  name: string | null;
}

/** GET /api/random-character response. */
export interface RandomCharacterResponse {
  name: string;
}

/**
 * Generic mobile sign-in bridge (both Google and magic-link email). Plain Expo Go has no
 * supported native Google Sign-In path, and email magic links need a real browser tab
 * regardless of platform, so the mobile app opens `GET /api/auth/mobile-auth-start` in a
 * browser tab (expo-web-browser's `openAuthSessionAsync`) — landing on NextAuth's own
 * sign-in page, the exact same one a web visitor uses for either provider — rather than
 * reimplementing either provider's flow itself. Once NextAuth's own callback route
 * completes (`/api/auth/callback/google` or `/api/auth/callback/email`, both unchanged),
 * the backend redirects back into the app's own `exp://`/custom-scheme redirect URI with
 * a `?token=` query param — a bearer JWT encoded the same way NextAuth's own session
 * cookie is (next-auth/jwt's `encode`). See pages/api/auth/mobile-auth-start.ts and
 * -complete.ts. There's no request/response JSON shape to type for that leg (it's a
 * chain of GET redirects, not a POST); `MobileSessionResponse` below is the one JSON
 * contract mobile actually calls.
 */

/**
 * GET /api/auth/mobile-session response — resolves the caller's bearer token to a
 * display identity (all fields null if not signed in). See
 * pages/api/auth/mobile-session.ts.
 */
export interface MobileSessionResponse {
  userId: string | null;
  email: string | null;
  name: string | null;
}

/**
 * Guessing-game types, shared by "Guess Who" and "Guess Who's Next" (see game.ts's
 * `GameDefinition`). These are the NORMALIZED client-side shapes: the round token is always
 * `token` here. On the wire it keeps its historical per-game name (`GameDefinition.tokenField`,
 * `guessWhoToken` or `gameToken`) so already-released mobile builds keep working; the
 * parse/request helpers in game.ts translate at the boundary.
 */

/** One speaker's display identity: the header name/portrait and a voice-selection hint. */
export interface GameSpeaker {
  name: string;
  avatarUrl: string;
  gender: string | null;
}

/**
 * Round state returned by POST /api/{game}/start and /continue — they share one pipeline
 * and one response shape. `token` is an opaque, signed blob the client echoes back on every
 * later call; never decode it client-side. `speaker` is present only when the game shows
 * its chat partner up front ("Guess Who's Next"); in "Guess Who" the round's speaker is the
 * mystery itself, so identity is withheld until a reveal.
 */
export interface GameRoundResult {
  token: string;
  speaker: GameSpeaker | null;
  reply: string;
  audioFileUrl?: string;
  streak: number;
}

/** POST /api/{game}/message request — one turn of chat, or a guess, in the same field. */
export interface GameMessageRequest {
  token: string;
  message: string;
  conversationHistory?: string[];
}

/**
 * POST /api/{game}/message response. Which fields are present depends on how the message
 * was classified server-side (see utils/game/message.ts):
 * - `giveUpRequested`: the player asked to give up via chat — no reply/audio this turn; show
 *   the give-up confirmation, then call POST /give-up if confirmed.
 * - an ordinary reply: just `reply`/`audioFileUrl`.
 * - a correct guess: `correct: true`, `revealedName`, `streak`, plus a reaction `reply`; call
 *   POST /continue (with the same token) once the player clicks "Continue".
 * - a wrong-but-tolerated guess: `correct: false`, `gameOver: false`, `wrongGuessesRemaining`,
 *   and a bumped `token` to echo back next turn.
 * - a second wrong guess: `correct: false`, `gameOver: true`, `revealedName`, `finalStreak`.
 * A game whose speaker is the mystery also sends `avatarUrl`/`gender` with a reveal.
 */
export interface GameMessageResponse {
  giveUpRequested?: boolean;
  reply?: string;
  audioFileUrl?: string;
  correct?: boolean;
  gameOver?: boolean;
  revealedName?: string;
  avatarUrl?: string;
  gender?: string | null;
  streak?: number;
  finalStreak?: number;
  wrongGuessesRemaining?: number;
  token?: string;
}

/** POST /api/{game}/give-up response; `avatarUrl`/`gender` only when the speaker was the mystery. */
export interface GameGiveUpResponse {
  revealedName: string;
  avatarUrl?: string;
  gender?: string | null;
  finalStreak: number;
  gameOver: true;
}

/** GET /api/{game}/high-score response — null for a guest/no-database deployment. */
export interface GameHighScoreResponse {
  highScore: number | null;
}

/** One row of GET /api/{game}/leaderboard. */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  streak: number;
}

/** GET /api/{game}/leaderboard response — top ten opted-in scores. */
export interface GameLeaderboardResponse {
  entries: LeaderboardEntry[];
}

/** GET/POST /api/{game}/leaderboard-settings — this account or guest browser's public visibility. */
export interface LeaderboardSettingsResponse {
  available: boolean;
  showOnLeaderboard: boolean;
  eligible: boolean;
  name: string | null;
}

/** POST /api/{game}/leaderboard-settings request body. `name` is required when opting in. */
export interface LeaderboardSettingsRequest {
  showOnLeaderboard: boolean;
  name?: string;
}

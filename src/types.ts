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
  conversationHistory?: ChatMessage[];
  voiceConfig: CharacterVoiceConfig;
  stream?: boolean;
  userName?: string;
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
  | { chunk: string; done: false }
  | { reply: string; audioFileUrl?: string; done: true };

/** POST /api/validate-character request body. */
export interface ValidateCharacterRequest {
  characterName: string;
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
  blocked?: boolean;
  recognized?: boolean;
}

/** POST /api/generate-personality request body. */
export interface GeneratePersonalityRequest {
  name: string;
  /** Optional free-form character concept, collected when `recognized` is false. */
  description?: string;
}

/** POST /api/generate-personality response. */
export interface GeneratePersonalityResponse {
  personality: string;
  /** `name` with spelling/casing corrected, or an existing similar character's exact name. */
  correctedName: string;
  /** True unless Claude flagged the description itself as unsafe (see server docs). */
  descriptionRejected?: boolean;
}

/** POST /api/generate-avatar request body. */
export interface GenerateAvatarRequest {
  name: string;
  skipPersistence?: boolean;
  recognized?: boolean;
  appearanceDescription?: string;
}

/** POST /api/generate-avatar response. */
export interface GenerateAvatarResponse {
  avatarUrl: string;
  gender?: string | null;
}

/** One entry in the public /chars gallery (GET /api/chars). */
export interface CharacterEntry {
  name: string;
  avatarUrl: string;
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

/** One row of GET /api/messages?botName=<name>. */
export interface PersistedMessage {
  id: number;
  sender: string;
  text: string;
  createdAt: string;
}

/** GET/POST /api/user-profile — the human visitor's own preferred name. */
export interface UserProfile {
  preferredName: string | null;
}

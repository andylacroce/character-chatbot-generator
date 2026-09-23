/**
 * Character creation shared by the web app and the mobile app: the personality -> portrait
 * -> voice pipeline, and the platform-agnostic pieces of the creation flow around it (see
 * useCharacterCreation.ts). Each platform supplies a CreationTransport for its requests.
 */

import type { Bot, CharacterValidationResult, CharacterVoiceConfig } from "./types";

/** Which pipeline stage is running. */
export type CreationStep = "personality" | "avatar" | "voice" | null;

/**
 * Logs a creation event. `debug` events are development diagnostics a platform may drop in
 * production; `info`/`warn`/`error` always matter.
 */
export type CreationLogger = (
  level: "debug" | "info" | "warn" | "error",
  event: string,
  message: string,
  meta?: Record<string, unknown>,
) => void;

/** The requests creation needs. Personality and portrait resolve null on a non-2xx reply. */
export interface CreationTransport {
  /** Fails open to a safe, recognized result on any error, like the server does. */
  validate(name: string): Promise<CharacterValidationResult>;
  /** A random character name, with the platform's own fallback on error. */
  randomName(): Promise<string>;
  generatePersonality(request: {
    name: string;
    description?: string;
  }): Promise<{ personality?: string; correctedName?: string } | null>;
  generateAvatar(request: {
    name: string;
    skipPersistence: boolean;
    recognized: boolean;
    appearanceDescription?: string;
  }): Promise<{ avatarUrl?: string; gender?: string | null } | null>;
  getVoiceConfig(
    name: string,
    gender: string | null,
    voiceContext?: string,
  ): Promise<CharacterVoiceConfig>;
}

export interface GenerateCharacterOptions {
  onProgress: (step: CreationStep) => void;
  setLoadingMessage: (message: string | null) => void;
  /** Per-run cancellation token; a cancelled run throws `Error("cancelled")`. */
  cancelToken: { cancelled: boolean } | null;
  /**
   * True when the user clicked through a copyright warning: the portrait skips the shared
   * cache and durable storage, and the character is never saved to their account.
   */
  skipPersistence?: boolean;
  /** Free-form concept for an original (unrecognized) character. */
  description?: string;
  /** Companion appearance text for an original character's portrait. */
  appearance?: string;
  /** validate-character's `recognized`; false keeps the portrait out of the public gallery. */
  recognized?: boolean;
  log?: CreationLogger;
}

/** The generic persona used when personality generation fails. */
export function fallbackPersonality(name: string): string {
  return `You are ${name}. Stay in character.`;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Runs the personality -> portrait -> voice pipeline. Personality and portrait failures
 * degrade (a generic persona, the silhouette); only a missing voice fails the run, since
 * a character without a consistent voice isn't usable.
 */
export async function generateCharacter(
  transport: CreationTransport,
  originalName: string,
  {
    onProgress,
    setLoadingMessage,
    cancelToken,
    skipPersistence = false,
    description,
    appearance,
    recognized = true,
    log = () => {},
  }: GenerateCharacterOptions,
): Promise<Bot> {
  const checkCancelled = () => {
    if (cancelToken?.cancelled) throw new Error("cancelled");
  };
  let personality = fallbackPersonality(originalName);
  let correctedName = originalName;

  onProgress("personality");
  setLoadingMessage("Creating personality");
  checkCancelled();
  try {
    const data = await transport.generatePersonality({ name: originalName, description });
    checkCancelled();
    if (data) {
      if (data.personality) personality = data.personality;
      if (data.correctedName) correctedName = data.correctedName;
      log("debug", "bot_personality_generated", "Personality generated", {
        characterName: correctedName,
        originalName,
      });
    }
  } catch (err) {
    if (cancelToken?.cancelled) throw err;
    log(
      "debug",
      "bot_personality_generation_failed",
      "Personality generation failed, using default",
      {
        characterName: originalName,
        error: errorText(err),
      },
    );
  }

  onProgress("avatar");
  setLoadingMessage("Generating portrait");
  let avatarUrl = "/silhouette.svg";
  let gender: string | null = null;
  checkCancelled();
  try {
    const data = await transport.generateAvatar({
      name: correctedName,
      skipPersistence,
      recognized,
      appearanceDescription: appearance,
    });
    checkCancelled();
    if (data) {
      if (data.avatarUrl) {
        avatarUrl = data.avatarUrl;
        if (data.avatarUrl === "/silhouette.svg") setLoadingMessage("Using default image");
      }
      gender = data.gender || null;
    } else {
      setLoadingMessage("Using default image");
    }
  } catch (err) {
    if (cancelToken?.cancelled) throw err;
    setLoadingMessage("Using default image");
  }

  onProgress("voice");
  setLoadingMessage("Selecting voice");
  let voiceConfig: CharacterVoiceConfig | null = null;
  checkCancelled();
  try {
    voiceConfig = await transport.getVoiceConfig(correctedName, gender, personality);
    log("debug", "bot_voice_config_generated", "Voice config generated", {
      characterName: correctedName,
      voiceName: voiceConfig?.name,
    });
  } catch (err) {
    log("warn", "bot_voice_config_generation_failed", "Voice config generation failed", {
      characterName: correctedName,
      error: errorText(err),
    });
    setLoadingMessage("Using default voice");
  }
  checkCancelled();
  if (!voiceConfig) {
    throw new Error("Failed to generate a consistent voice for this character. Please try again.");
  }
  return { name: correctedName, personality, avatarUrl, voiceConfig, gender, skipPersistence };
}

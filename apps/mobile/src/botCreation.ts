import type { Bot } from "character-chatbot-shared";
import { generateAvatar, generatePersonality, getVoiceConfig } from "./api";

export interface CreateBotOptions {
  /** Free-form concept, collected when validate-character reports `recognized: false`. */
  description?: string;
  /** Companion appearance text from the same flow, steers avatar generation. */
  appearanceDescription?: string;
  /**
   * True when the user clicked through a copyright warning, or when the name went
   * through the description flow (an original/unrecognized character) — keeps the
   * avatar out of the shared cache/public Character Wall either way. Mirrors
   * useBotCreation.ts's bypassedCopyrightWarning/proceedWithoutValidationRef.
   */
  skipPersistence?: boolean;
  /** Mirrors validate-character's `recognized` (defaults true — fail open, same as the server). */
  recognized?: boolean;
}

/**
 * Runs the personality → avatar → voice pipeline shared by CreatorScreen (typed name)
 * and CharWallScreen (tapped an existing portrait) — mirrors the web app's
 * generateBotDataWithProgressCancelable in useBotCreation.ts.
 */
export async function createBot(
  name: string,
  onProgress: (message: string) => void,
  isCancelled: () => boolean,
  options: CreateBotOptions = {},
): Promise<Bot | null> {
  const { description, appearanceDescription, skipPersistence, recognized = true } = options;

  onProgress("Creating personality");
  const { personality, correctedName } = await generatePersonality({ name, description });
  if (isCancelled()) return null;

  onProgress("Generating portrait");
  const { avatarUrl, gender } = await generateAvatar({
    name: correctedName,
    skipPersistence,
    recognized,
    appearanceDescription,
  });
  if (isCancelled()) return null;

  onProgress("Selecting voice");
  const voiceConfig = await getVoiceConfig(correctedName, gender);
  if (isCancelled()) return null;

  return { name: correctedName, personality, avatarUrl, voiceConfig, gender, skipPersistence };
}

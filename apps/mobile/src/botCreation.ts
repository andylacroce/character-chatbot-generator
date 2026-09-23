import type { Bot, CharacterValidationResult, CreationTransport } from "character-chatbot-shared";
import {
  generateAvatar,
  generatePersonality,
  getRandomCharacter,
  getVoiceConfig,
  persistBot,
  validateCharacter,
} from "./api";
import { getCachedAuthToken } from "./authToken";

const failOpen = (name: string): CharacterValidationResult => ({
  characterName: name,
  isPublicDomain: true,
  isSafe: true,
  warningLevel: "none",
  recognized: true,
});

/**
 * The mobile app's requests for character-chatbot-shared's creation pipeline (the web
 * app's equivalent lives in useBotCreation.ts). Validation fails open and a failed random
 * pick falls back to a default name, same as the web app.
 */
export const mobileTransport: CreationTransport = {
  async validate(name) {
    try {
      return (await validateCharacter(name)) ?? failOpen(name);
    } catch {
      return failOpen(name);
    }
  },
  async randomName() {
    try {
      return (await getRandomCharacter()).name;
    } catch {
      return "Sherlock Holmes";
    }
  },
  generatePersonality: (req) => generatePersonality(req).catch(() => null),
  generateAvatar: (req) => generateAvatar(req).catch(() => null),
  getVoiceConfig: (name, gender, voiceContext) => getVoiceConfig(name, gender, voiceContext),
};

/**
 * Persists a created character to the signed-in user's account (`POST /api/bots`,
 * which itself no-ops server-side for guests) — fire-and-forget, matching the web
 * app's handleBotCreated exactly, so a persistence failure never blocks or fails an
 * otherwise-successful bot creation. Never called for a `skipPersistence` bot (a
 * copyright-warning override or original character), same as the web app.
 */
export function persistBotIfSignedIn(bot: Bot): void {
  if (bot.skipPersistence || !getCachedAuthToken()) return;
  persistBot({
    name: bot.name,
    personality: bot.personality,
    avatarUrl: bot.avatarUrl || null,
    gender: bot.gender ?? null,
    voiceConfig: bot.voiceConfig,
  }).catch(() => {});
}

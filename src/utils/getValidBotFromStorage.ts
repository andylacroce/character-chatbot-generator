import type { Bot } from "../app/components/BotCreator";
import storage from "./storage";
import { STORAGE_KEYS } from "character-chatbot-shared";

/**
 * Utility to retrieve a valid bot from localStorage with 6-hour expiration.
 * Automatically removes expired entries and validates bot structure.
 */
export function getValidBotFromStorage(): Bot | null {
  const saved = storage.getItem(STORAGE_KEYS.bot);
  const savedTime = storage.getItem(STORAGE_KEYS.botTimestamp);
  if (saved && savedTime) {
    const age = Date.now() - parseInt(savedTime, 10);
    const sixHours = 6 * 60 * 60 * 1000;
    if (age < sixHours) {
      return storage.getJSON<Bot>(STORAGE_KEYS.bot);
    }
  }
  storage.removeItem(STORAGE_KEYS.bot);
  storage.removeItem(STORAGE_KEYS.botTimestamp);
  return null;
}

/**
 * Clears the active bot session pointer from localStorage — the same two keys
 * `app/index.tsx`'s "Back to Character Creator" clears. Used anywhere else that needs
 * a guaranteed landing on the actual creator page rather than whichever view the root
 * route happens to render from leftover storage state (see AuthControl.tsx/
 * SignInModal.tsx: without this, navigating to "/" after signing in or out still shows
 * ChatPage if a bot session was already stored, since Home reads localStorage on every
 * mount regardless of navigation intent).
 */
export function clearStoredBot() {
  storage.removeItem(STORAGE_KEYS.bot);
  storage.removeItem(STORAGE_KEYS.botTimestamp);
}

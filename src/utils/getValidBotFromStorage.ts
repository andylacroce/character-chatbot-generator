import type { Bot } from "../../app/components/BotCreator";
import storage from "./storage";
import { STORAGE_KEYS } from "./storageKeys";

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

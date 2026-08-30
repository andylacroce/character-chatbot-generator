import type { Bot } from "../../app/components/BotCreator";
import storage from "./storage";

/**
 * Utility to retrieve a valid bot from localStorage with 6-hour expiration.
 * Automatically removes expired entries and validates bot structure.
 */
export function getValidBotFromStorage(): Bot | null {
    const saved = storage.getItem("chatbot-bot");
    const savedTime = storage.getItem("chatbot-bot-timestamp");
    if (saved && savedTime) {
        const age = Date.now() - parseInt(savedTime, 10);
        const sixHours = 6 * 60 * 60 * 1000;
        if (age < sixHours) {
            return storage.getJSON<Bot>("chatbot-bot");
        }
    }
    storage.removeItem("chatbot-bot");
    storage.removeItem("chatbot-bot-timestamp");
    return null;
}

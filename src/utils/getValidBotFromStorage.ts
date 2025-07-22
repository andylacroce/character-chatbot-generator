import type { Bot } from "../../app/components/BotCreator";
// Utility to get a valid bot from localStorage, expiring after 6 hours
export function getValidBotFromStorage(): Bot | null {
    try {
        const saved = localStorage.getItem("chatbot-bot");
        const savedTime = localStorage.getItem("chatbot-bot-timestamp");
        if (saved && savedTime) {
            const now = Date.now();
            const age = now - parseInt(savedTime, 10);
            const sixHours = 6 * 60 * 60 * 1000;
            if (age < sixHours) {
                return JSON.parse(saved) as Bot;
            } else {
                localStorage.removeItem("chatbot-bot");
                localStorage.removeItem("chatbot-bot-timestamp");
                return null;
            }
        } else {
            localStorage.removeItem("chatbot-bot");
            localStorage.removeItem("chatbot-bot-timestamp");
            return null;
        }
    } catch {
        return null;
    }
}

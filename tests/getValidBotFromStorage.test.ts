import { getValidBotFromStorage } from "../src/utils/getValidBotFromStorage";

describe("getValidBotFromStorage", () => {
    const bot = { name: "Test", personality: "fun", avatarUrl: "url", voiceConfig: null };
    const sixHours = 6 * 60 * 60 * 1000;

    beforeEach(() => {
        localStorage.clear();
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it("returns bot if not expired", () => {
        localStorage.setItem("chatbot-bot", JSON.stringify(bot));
        localStorage.setItem("chatbot-bot-timestamp", (Date.now()).toString());
        expect(getValidBotFromStorage()).toEqual(bot);
    });

    it("removes and returns null if expired", () => {
        localStorage.setItem("chatbot-bot", JSON.stringify(bot));
        localStorage.setItem("chatbot-bot-timestamp", (Date.now() - sixHours - 1000).toString());
        expect(getValidBotFromStorage()).toBeNull();
        expect(localStorage.getItem("chatbot-bot")).toBeNull();
        expect(localStorage.getItem("chatbot-bot-timestamp")).toBeNull();
    });

    it("removes and returns null if timestamp missing", () => {
        localStorage.setItem("chatbot-bot", JSON.stringify(bot));
        expect(getValidBotFromStorage()).toBeNull();
        expect(localStorage.getItem("chatbot-bot")).toBeNull();
        expect(localStorage.getItem("chatbot-bot-timestamp")).toBeNull();
    });

    it("removes and returns null if bot missing", () => {
        localStorage.setItem("chatbot-bot-timestamp", Date.now().toString());
        expect(getValidBotFromStorage()).toBeNull();
        expect(localStorage.getItem("chatbot-bot")).toBeNull();
        expect(localStorage.getItem("chatbot-bot-timestamp")).toBeNull();
    });
});

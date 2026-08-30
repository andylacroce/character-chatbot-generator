import { renderHook, waitFor } from "@testing-library/react";
import type { Bot } from "../../../app/components/BotCreator";

// Phase 3c: on mount, a signed-in user's chat window reconciles with server-persisted
// history (GET /api/messages) — see useChatController.ts. Local storage stays the
// instant-load cache; the server list is only adopted when it's strictly longer.

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
    useSession: () => mockUseSession(),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
    authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

jest.mock("../../../src/utils/logger", () => ({
    logEvent: jest.fn(),
    sanitizeLogMeta: (m: unknown) => m,
}));

jest.mock("../../../src/utils/voiceConfigPersistence", () => ({
    loadVoiceConfig: jest.fn(() => null),
    persistVoiceConfig: jest.fn(),
}));

jest.mock("../../../app/components/useAudioPlayer", () => ({
    useAudioPlayer: () => ({
        playAudio: jest.fn(),
        stopAudio: jest.fn(),
        isAudioPlaying: () => false,
        audioRef: { current: { muted: false } },
    }),
}));

jest.mock("../../../app/components/api_getVoiceConfigForCharacter", () => ({
    api_getVoiceConfigForCharacter: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../../src/utils/downloadTranscript", () => ({
    downloadTranscript: jest.fn(),
}));

const storedHistory: Record<string, string> = {};
jest.mock("../../../src/utils/storage", () => ({
    getItem: jest.fn((key: string) => storedHistory[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { storedHistory[key] = value; }),
    removeItem: jest.fn((key: string) => { delete storedHistory[key]; }),
    setVersionedJSON: jest.fn(),
    getVersionedJSON: jest.fn(),
}));

import { useChatController } from "../../../app/components/useChatController";
import { mockResponse } from "../../helpers/mockResponse";

const mockBot: Bot = {
    name: "Gandalf",
    personality: "wise",
    avatarUrl: "/silhouette.svg",
    voiceConfig: {
        languageCodes: ["en-US"],
        name: "en-US-Wavenet-D",
        ssmlGender: 1,
        pitch: 0,
        rate: 1.0,
        type: "Wavenet",
    },
};

describe("useChatController — server history reconciliation", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.keys(storedHistory).forEach((k) => delete storedHistory[k]);
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (typeof url === "string" && url.startsWith("/api/messages")) {
                return Promise.resolve(mockResponse({ messages: [] }));
            }
            return Promise.resolve(mockResponse({}));
        });
    });

    it("never fetches /api/messages for a guest", async () => {
        mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });

        renderHook(() => useChatController(mockBot));

        await waitFor(() => {
            expect(mockAuthenticatedFetch.mock.calls.some((c) => String(c[0]).startsWith("/api/messages"))).toBe(false);
        });
    });

    it("adopts the server's history when it is longer than what's loaded locally", async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
        storedHistory["chatbot-history-Gandalf"] = JSON.stringify([{ sender: "User", text: "hi" }]);
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (typeof url === "string" && url.startsWith("/api/messages")) {
                return Promise.resolve(mockResponse({
                    messages: [
                        { sender: "User", text: "hi" },
                        { sender: "Gandalf", text: "Greetings." },
                        { sender: "User", text: "how are you" },
                    ],
                }));
            }
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(mockBot));

        await waitFor(() => expect(result.current.messages.length).toBe(3));
        expect(result.current.messages[2]).toEqual({ sender: "User", text: "how are you" });
    });

    it("requests the bot's own name", async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });

        renderHook(() => useChatController(mockBot));

        await waitFor(() => {
            expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/messages?botName=Gandalf");
        });
    });

    it("keeps the local list when the server has fewer or equal messages", async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
        storedHistory["chatbot-history-Gandalf"] = JSON.stringify([
            { sender: "User", text: "hi" },
            { sender: "Gandalf", text: "Greetings." },
        ]);
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (typeof url === "string" && url.startsWith("/api/messages")) {
                return Promise.resolve(mockResponse({ messages: [{ sender: "User", text: "hi" }] }));
            }
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(mockBot));

        await waitFor(() => expect(mockAuthenticatedFetch.mock.calls.some((c) => String(c[0]).startsWith("/api/messages"))).toBe(true));
        expect(result.current.messages).toEqual([
            { sender: "User", text: "hi" },
            { sender: "Gandalf", text: "Greetings." },
        ]);
    });

    it("does not fire a duplicate intro request when server history exists but local storage is empty (new device / cleared cache)", async () => {
        // Regression test: the intro-generation effect used to key off local messages.length
        // alone, so on a device with no local cache it would fire "Introduce yourself..."
        // before this reconciliation fetch resolved — persisting a bogus intro turn on top
        // of the character's real, already-saved history. See historyReconciled in
        // useChatController.ts.
        mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (typeof url === "string" && url.startsWith("/api/messages")) {
                return Promise.resolve(mockResponse({
                    messages: [
                        { sender: "Gandalf", text: "Greetings, traveller." },
                        { sender: "User", text: "hello" },
                    ],
                }));
            }
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(mockBot));

        await waitFor(() => expect(result.current.messages.length).toBe(2));
        // Give the (would-be) intro effect a tick to fire if the gate weren't working.
        await new Promise((r) => setTimeout(r, 20));
        expect(mockAuthenticatedFetch.mock.calls.some((c) => String(c[0]).startsWith("/api/chat"))).toBe(false);
    });

    it("silently keeps the local list when the fetch fails", async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
        storedHistory["chatbot-history-Gandalf"] = JSON.stringify([{ sender: "User", text: "hi" }]);
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (typeof url === "string" && url.startsWith("/api/messages")) {
                return Promise.reject(new Error("network down"));
            }
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(mockBot));

        await waitFor(() => expect(mockAuthenticatedFetch.mock.calls.some((c) => String(c[0]).startsWith("/api/messages"))).toBe(true));
        expect(result.current.messages).toEqual([{ sender: "User", text: "hi" }]);
    });
});

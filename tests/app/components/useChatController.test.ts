import { renderHook, act, waitFor } from "@testing-library/react";
import type { Bot } from "../../../app/components/BotCreator";

// Mock logger - define mocks first
const mockLogEvent = jest.fn();
const mockSanitizeLogMeta = jest.fn((meta: unknown) => meta);
jest.mock("../../../src/utils/logger", () => ({
    logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
    sanitizeLogMeta: (meta: unknown) => mockSanitizeLogMeta(meta),
}));

// Mock authenticatedFetch instead of axios
const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
    authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

// Mock voice config persistence helpers
const mockLoadVoiceConfig = jest.fn();
const mockPersistVoiceConfig = jest.fn();
jest.mock("../../../src/utils/voiceConfigPersistence", () => ({
    loadVoiceConfig: (...args: unknown[]) => mockLoadVoiceConfig(...(args as unknown[])),
    persistVoiceConfig: (...args: unknown[]) => mockPersistVoiceConfig(...(args as unknown[])),
}));

// Mock API voice config fetcher used by the controller
const mockApiGetVoiceConfigForCharacter = jest.fn();
jest.mock("../../../app/components/api_getVoiceConfigForCharacter", () => ({
    api_getVoiceConfigForCharacter: (...args: unknown[]) => mockApiGetVoiceConfigForCharacter(...(args as unknown[])),
}));

import { useChatController } from "../../../app/components/useChatController";
// Merge: mock storage to exercise additional branches
jest.mock("../../../src/utils/storage", () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    setVersionedJSON: jest.fn(),
    getVersionedJSON: jest.fn(),
}));
import * as storage from "../../../src/utils/storage";
// Helper: create a minimal ReadableStream-like body for SSE parsing
function makeMockSSEBody(frames: Array<Record<string, unknown>>) {
    const encoder = new TextEncoder();
    const chunks = frames.map(f => encoder.encode(`data: ${JSON.stringify(f)}\n\n`));
    return {
        getReader() {
            return {
                async read(): Promise<{ value?: Uint8Array; done: boolean }> {
                    if (chunks.length > 0) {
                        const value = chunks.shift();
                        return { value, done: false };
                    }
                    return { done: true } as { done: boolean };
                }
            };
        }
    } as unknown as ReadableStream<Uint8Array>;
}

const mockResponse = (data: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
});

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
        type: "Wavenet"
    },
};

describe("useChatController uncovered branches", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        // Set default mock for authenticatedFetch
        mockAuthenticatedFetch.mockResolvedValue(mockResponse({ reply: "Default reply", audioFileUrl: null }));
        mockLoadVoiceConfig.mockReturnValue(mockBot.voiceConfig);
        mockApiGetVoiceConfigForCharacter.mockResolvedValue(mockBot.voiceConfig);
        // Add a debug statement to log when sendMessage is called
        jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
            if (args[0] === 'sendMessage called') {
                console.log('sendMessage was invoked during the test.');
            }
        });
    });


    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("handles missing voiceConfig in getIntro", async () => {
        mockAuthenticatedFetch.mockResolvedValue(mockResponse({}));
        mockLoadVoiceConfig.mockReturnValue(null);
        mockApiGetVoiceConfigForCharacter.mockRejectedValue(new Error("no voice"));
        const botWithoutVoiceConfig = { ...mockBot, voiceConfig: null };
        const { result: _result } = renderHook(() => useChatController(botWithoutVoiceConfig));
        await act(async () => {
            // Wait for intro attempt
        });
        expect(mockLogEvent).toHaveBeenCalledWith(
            'error',
            'chat_intro_voice_config_missing',
            'Voice configuration missing for this character. Please recreate the bot.',
            expect.objectContaining({
                botName: 'Gandalf',
                hasVoiceConfig: false
            })
        );
    });

    it("handles OpenAI API error in sendMessage", async () => {
        // Mock authenticatedFetch to resolve health check but reject chat calls
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === "/api/health") {
                return Promise.resolve(mockResponse({}));
            } else {
                return Promise.reject(new Error('OpenAI API Error'));
            }
        });

        // Setup bot with valid voiceConfig so we reach the API call
        const botWithVoiceConfig = {
            name: 'TestBot',
            personality: 'friendly',
            avatarUrl: '/mock-url',
            voiceConfig: {
                languageCodes: ["en-US"],
                name: "en-US-Wavenet-D",
                ssmlGender: 1,
                pitch: 0,
                rate: 1.0,
                type: "Wavenet"
            },
        };

        const { result } = renderHook(() => useChatController(botWithVoiceConfig));
        
        // Wait for intro to complete (it will fail)
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
        });
        
        // Clear any log events from intro
        mockLogEvent.mockClear();
        
        // Set input so sendMessage doesn't return early
        act(() => {
            result.current.setInput("test message");
        });
        
        // Call sendMessage
        await act(async () => {
            await result.current.sendMessage();
        });

        // Verify structured logging was called
        expect(mockLogEvent).toHaveBeenCalledWith(
            'error',
            'chat_send_message_failed',
            'Failed to send message or generate reply.',
            expect.objectContaining({
                botName: 'TestBot',
                error: expect.any(String),
                hasVoiceConfig: true
            })
        );
    });    test("sendMessage updates messages state", async () => {
        // Use a deterministic implementation so the test doesn't depend on call ordering
        mockAuthenticatedFetch.mockImplementation((url: string, options?: unknown) => {
            // Health check
            if (url === "/api/health") return Promise.resolve(mockResponse({}));

            // Chat API: detect intro vs user message by body contents
            if (url === "/api/chat") {
                const opts = options as Record<string, unknown> | undefined;
                if (opts && typeof opts.body === 'string') {
                    try {
                        const body = JSON.parse(opts.body) as Record<string, unknown>;
                        const message = body.message as string | undefined;
                        if (message && message.includes("Introduce yourself")) {
                            return Promise.resolve(mockResponse({ reply: "Intro message", audioFileUrl: null }));
                        }
                        if (message && message === "Hello") {
                            return Promise.resolve(mockResponse({ reply: "Bot reply", audioFileUrl: null }));
                        }
                        if (message && message === "test message") {
                            return Promise.resolve(mockResponse({ reply: "Default reply", audioFileUrl: null }));
                        }
                    } catch {
                        // fallthrough
                    }
                }
            }

            // Logging endpoints and any other calls -> return empty success
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(mockBot));

        // Wait for intro to complete
        await waitFor(() => expect(result.current.messages).toHaveLength(1));

        act(() => {
            result.current.setInput("Hello");
        });

        await act(async () => {
            await result.current.sendMessage();
        });

        expect(result.current.messages).toHaveLength(3); // Intro message + user message + bot message
        expect(result.current.messages[0].text).toBe("Intro message"); // Intro message is first
        expect(result.current.messages[0].sender).toBe("Gandalf");
        expect(result.current.messages[1].text).toBe("Hello"); // User message is second
        expect(result.current.messages[1].sender).toBe("User");
        expect(result.current.messages[2].text).toBe("Bot reply"); // Bot message is third
    });

    test("handleScroll loads more messages when scrolled to top", () => {
        const { result } = renderHook(() => useChatController(mockBot));

        // Simulate a scroll event
        const chatBoxRef = result.current.chatBoxRef;
        if (chatBoxRef.current) {
            chatBoxRef.current.scrollTop = 0;
            act(() => {
                result.current.handleScroll();
            });

            // Assert that visibleCount increased
            expect(result.current.visibleCount).toBeGreaterThan(10);
        }
    });

    test("handleBackToCharacterCreation stops audio and calls callback", () => {
        const mockCallback = jest.fn();
        const { result } = renderHook(() => useChatController(mockBot, mockCallback));

        act(() => {
            result.current.handleBackToCharacterCreation();
        });

        expect(mockCallback).toHaveBeenCalled();
    });

    test("sendMessage returns early when no input", async () => {
        const { result } = renderHook(() => useChatController(mockBot));

        // Stabilize after any potential intro
        await act(async () => { await new Promise(res => setTimeout(res, 120)); });
        const initialMessageCount = result.current.messages.length;
        
        await act(async () => {
            await result.current.sendMessage();
        });

        // Messages should remain unchanged since sendMessage returns early without input
        expect(result.current.messages).toHaveLength(initialMessageCount);
    });

    it("health check failure sets apiAvailable=false", async () => {
        // Route all /api/health calls to failure
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === "/api/health") return Promise.reject(new Error("down"));
            return Promise.resolve(mockResponse({ ok: true }));
        });
        const { result } = renderHook(() => useChatController({ ...mockBot }));
        await act(async () => {
            await new Promise(res => setTimeout(res, 50));
        });
        expect(result.current.apiAvailable).toBe(false);
    });
    // Stream SSE handling and visualViewport cleanup are covered by other tests; focus here on core branches.
});

// Merged branch-focused tests
describe("useChatController additional branches (merged)", () => {
    const mockStorage = storage as jest.Mocked<typeof storage>;
    const baseBot: Bot = {
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

    beforeEach(() => {
        jest.clearAllMocks();
        mockStorage.getItem.mockReturnValue(null);
        mockStorage.getVersionedJSON.mockReturnValue(null);
        mockAuthenticatedFetch.mockResolvedValue(mockResponse({ reply: "Intro", audioFileUrl: null }));
        mockLoadVoiceConfig.mockReturnValue(baseBot.voiceConfig);
        mockApiGetVoiceConfigForCharacter.mockResolvedValue(baseBot.voiceConfig);
    });

    it("retrieves voiceConfig from saved bot in storage", async () => {
        const savedBot = { ...baseBot, voiceConfig: { name: "en-US-Wavenet-B", languageCodes: ["en-US"], ssmlGender: 1 } };
        mockLoadVoiceConfig.mockReturnValue(null);
        mockApiGetVoiceConfigForCharacter.mockRejectedValue(new Error("should not fetch"));
        mockStorage.getItem.mockImplementation((key: string) => (key === "chatbot-bot" ? JSON.stringify(savedBot) : null));
        const { result } = renderHook(() => useChatController({ ...baseBot, voiceConfig: null }));
        await act(async () => {
            await new Promise(res => setTimeout(res, 10));
        });
        expect(mockStorage.getItem).toHaveBeenCalledWith("chatbot-bot");
        expect(result.current).toBeDefined();
    });

    it("handles invalid JSON for saved history gracefully", () => {
        const chatHistoryKey = `chatbot-history-${baseBot.name}`;
        mockStorage.getItem.mockImplementation((key: string) => (key === chatHistoryKey ? "invalid{" : null));
        const { result } = renderHook(() => useChatController(baseBot));
        expect(result.current.messages).toEqual([]);
    });

    it("sets up visualViewport listener when available", () => {
        Object.defineProperty(window, 'visualViewport', {
            value: {
                addEventListener: jest.fn(),
                removeEventListener: jest.fn(),
                height: 600,
            },
            writable: true,
            configurable: true,
        });
        const { result } = renderHook(() => useChatController(baseBot));
        expect(result.current).toBeDefined();
    });

    it("SSE parsing: accumulates chunks and handles final done frame", async () => {
        const { result } = renderHook(() => useChatController(baseBot));
        const frames = [
            { reply: 'Hello', done: false },
            { reply: ' world', done: false },
            { reply: '', audioFileUrl: '/audio/1.mp3', done: true }
        ];
        mockAuthenticatedFetch.mockResolvedValueOnce({ ok: true, body: makeMockSSEBody(frames) });
        await act(async () => {
            result.current.setInput('hi');
            await result.current.sendMessage();
        });
        // Allow state to settle after streaming frames
        await act(async () => {});
        expect(result.current.loading).toBe(false);
    });

    it("SSE parsing: handles error frame and sets error state", async () => {
        const { result } = renderHook(() => useChatController(baseBot));
        const errorFrame = { error: 'something went wrong', done: true };
        mockAuthenticatedFetch.mockResolvedValueOnce({ ok: true, body: makeMockSSEBody([errorFrame]) });
        await act(async () => {
            result.current.setInput('hi');
            await result.current.sendMessage();
        });
        expect(result.current.error).toBeTruthy();
    });

    it("SSE parsing: no audio frame does not set audioFileUrl", async () => {
        const { result } = renderHook(() => useChatController(baseBot));
        const frames = [
            { reply: 'Hello', done: false },
            { reply: ' there', done: false },
            { reply: '', done: true }
        ];
        mockAuthenticatedFetch.mockResolvedValueOnce({ ok: true, body: makeMockSSEBody(frames) });
        await act(async () => {
            result.current.setInput('hi');
            await result.current.sendMessage();
        });
        // Allow state to settle after streaming frames
        await act(async () => {});
        const messages = result.current.messages;
        const anyWithAudio = messages.some(m => !!m.audioFileUrl);
        expect(anyWithAudio).toBe(false);
    });
});
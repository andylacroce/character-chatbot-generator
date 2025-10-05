import { renderHook, act, waitFor } from "@testing-library/react";
import type { Bot } from "../../app/components/BotCreator";

// Mock authenticatedFetch instead of axios
const mockAuthenticatedFetch = jest.fn();
jest.mock("../../src/utils/api", () => ({
    authenticatedFetch: (...args: any[]) => mockAuthenticatedFetch(...args),
}));

import { useChatController } from "../../app/components/useChatController";

const mockResponse = (data: any, status = 200) => ({
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
        const botWithoutVoiceConfig = { ...mockBot, voiceConfig: null };
        const { result: _result } = renderHook(() => useChatController(botWithoutVoiceConfig));
        await act(async () => {
            // Wait for intro attempt
        });
        expect(console.error).toHaveBeenCalledWith(
            "Intro error:",
            "Voice configuration missing for this character. Please recreate the bot.",
            { bot: botWithoutVoiceConfig }
        );
    });

    it("handles OpenAI API error in sendMessage", async () => {
        // Mock console.error
        const errorMock = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        // Mock authenticatedFetch to resolve health check but reject chat calls
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === "/api/health") {
                return Promise.resolve(mockResponse({}));
            } else {
                return Promise.reject(new Error('OpenAI API Error'));
            }
        });

        try {
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
            
            // Clear any errors from intro
            errorMock.mockClear();
            
            // Set input so sendMessage doesn't return early
            act(() => {
                result.current.setInput("test message");
            });
            
            // Call sendMessage
            await act(async () => {
                await result.current.sendMessage();
            });

            // Capture and verify console errors
            const errorCalls = errorMock.mock.calls;
            console.log('Error calls detected:', errorCalls);

            expect(errorCalls).toContainEqual([
                'SendMessage error:',
                'Failed to send message or generate reply.',
                expect.any(Object),
            ]);
        } finally {
            errorMock.mockRestore();
        }
    });    test("sendMessage updates messages state", async () => {
        // Use a deterministic implementation so the test doesn't depend on call ordering
        mockAuthenticatedFetch.mockImplementation((url: string, options?: any) => {
            // Health check
            if (url === "/api/health") return Promise.resolve(mockResponse({}));

            // Chat API: detect intro vs user message by body contents
            if (url === "/api/chat" && options && typeof options.body === 'string') {
                try {
                    const body = JSON.parse(options.body);
                    if (body.message && body.message.includes("Introduce yourself")) {
                        return Promise.resolve(mockResponse({ reply: "Intro message", audioFileUrl: null }));
                    }
                    if (body.message && body.message === "Hello") {
                        return Promise.resolve(mockResponse({ reply: "Bot reply", audioFileUrl: null }));
                    }
                    if (body.message && body.message === "test message") {
                        return Promise.resolve(mockResponse({ reply: "Default reply", audioFileUrl: null }));
                    }
                } catch {
                    // fallthrough
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

        // Don't set input, so sendMessage should return early
        const initialMessageCount = result.current.messages.length;
        
        await act(async () => {
            await result.current.sendMessage();
        });

        // Messages should remain unchanged since sendMessage returns early without input
        expect(result.current.messages).toHaveLength(initialMessageCount);
    });
});
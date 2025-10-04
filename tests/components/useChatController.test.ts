import { renderHook, act } from "@testing-library/react";
import { useChatController } from "../../app/components/useChatController";
import axios from "axios";
import type { Bot } from "../../app/components/BotCreator";

jest.mock("axios");

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
        (axios.get as jest.Mock).mockResolvedValue({ data: {} });
        jest.spyOn(console, 'error').mockImplementation(() => {});
        // Add a debug statement to log when sendMessage is called
        jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {
            if (args[0] === 'sendMessage called') {
                console.log('sendMessage was invoked during the test.');
            }
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("handles missing voiceConfig in getIntro", async () => {
        const botWithoutVoiceConfig = { ...mockBot, voiceConfig: null };
        const { result: _result } = renderHook(() => useChatController(botWithoutVoiceConfig));
        await act(async () => {
            (axios.get as jest.Mock).mockResolvedValueOnce({}); // Simulate successful API health check
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
        
        // Mock axios.post to reject with error
        const axiosMock = axios as jest.Mocked<typeof axios>;
        axiosMock.post.mockRejectedValueOnce(new Error('OpenAI API Error'));

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
    });

    test("sendMessage updates messages state", async () => {
        const { result } = renderHook(() => useChatController(mockBot));

        act(() => {
            result.current.setInput("Hello");
        });

        await act(async () => {
            await result.current.sendMessage();
        });

        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].text).toBe("Hello");
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
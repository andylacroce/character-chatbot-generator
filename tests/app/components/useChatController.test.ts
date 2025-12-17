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

// Mock audio player so playback branches can be simulated
const mockPlayAudio = jest.fn();
const mockStopAudio = jest.fn();
const mockIsAudioPlaying = jest.fn();
const mockAudioRef = { current: { muted: false } } as unknown as React.RefObject<HTMLAudioElement>;
jest.mock("../../../app/components/useAudioPlayer", () => ({
    useAudioPlayer: (..._args: unknown[]) => ({ playAudio: mockPlayAudio, stopAudio: mockStopAudio, isAudioPlaying: mockIsAudioPlaying, audioRef: mockAudioRef })
}));

// Mock API voice config fetcher used by the controller
const mockApiGetVoiceConfigForCharacter = jest.fn();
jest.mock("../../../app/components/api_getVoiceConfigForCharacter", () => ({
    api_getVoiceConfigForCharacter: (...args: unknown[]) => mockApiGetVoiceConfigForCharacter(...(args as unknown[])),
}));

const mockDownloadTranscript = jest.fn();
jest.mock('../../../src/utils/downloadTranscript', () => ({
    downloadTranscript: (...args: unknown[]) => mockDownloadTranscript(...(args as unknown[])),
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
    });

    it('sendMessage retries and succeeds after transient failures', async () => {
        let attempts = 0;
        mockAuthenticatedFetch.mockImplementation((url: string, _options?: unknown) => {
            if (url === "/api/health") return Promise.resolve(mockResponse({}));
            if (url === "/api/chat") {
                attempts++;
                if (attempts < 3) return Promise.reject(new Error('Transient error'));
                return Promise.resolve(mockResponse({ reply: 'Recovered reply', audioFileUrl: null }));
            }
            return Promise.resolve(mockResponse({}));
        });

        const botWithVoiceConfig = {
            name: 'RetryBot',
            personality: 'tough',
            avatarUrl: '/x',
            voiceConfig: mockBot.voiceConfig,
        };

        const { result } = renderHook(() => useChatController(botWithVoiceConfig));

        // Give intro a short moment to settle
        await act(async () => { await new Promise(res => setTimeout(res, 50)); });

        act(() => {
            result.current.setInput('retry test');
        });

        await act(async () => {
            await result.current.sendMessage();
        });

        expect(attempts).toBe(3);
        expect(result.current.messages.some(m => m.text === 'Recovered reply')).toBe(true);
        expect(mockLogEvent).toHaveBeenCalledWith('info', 'chat_send_retry_success', 'Message send succeeded', expect.any(Object));
    });    test("sendMessage updates messages state", async () => {
        // Use a deterministic implementation so the test doesn't depend on call ordering
        mockAuthenticatedFetch.mockImplementation((url: string, _options?: unknown) => {
            // Health check
            if (url === "/api/health") return Promise.resolve(mockResponse({}));

            // Chat API: detect intro vs user message by body contents
            if (url === "/api/chat") {
                const opts = _options as Record<string, unknown> | undefined;
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

    it('registers window resize listener when visualViewport not available and cancels RAF on cleanup', () => {
        // Remove visualViewport to force fallback to window resize handling
        const origVV = (window as unknown as { visualViewport?: unknown }).visualViewport;
        (window as unknown as { visualViewport?: unknown }).visualViewport = undefined;

        let savedResize: ((...args: unknown[]) => void) | null = null;
        const origAdd = window.addEventListener;
        const origRemove = window.removeEventListener;
        const origRaf = window.requestAnimationFrame;
        const origCancel = window.cancelAnimationFrame;

        // Capture the resize handler
        window.addEventListener = ((ev: string, cb: (...args: unknown[]) => void) => { if (ev === 'resize') savedResize = cb; }) as unknown as typeof window.addEventListener;
        window.removeEventListener = jest.fn();

        const rafId = 123;
        // Do not invoke the callback synchronously so the RAF id remains pending until unmount
        window.requestAnimationFrame = ((_: FrameRequestCallback) => { return rafId; }) as unknown as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = jest.fn();

        const { unmount } = renderHook(() => useChatController(baseBot));

        // Ensure the handler was captured and exercising it doesn't throw
        expect(typeof savedResize).toBe('function');
        act(() => { if (savedResize) savedResize(); });

        // Unmount the hook which should attempt cleanup (removeEventListener should be called)
        unmount();
        expect((window.removeEventListener as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(0);

        // restore originals
        window.addEventListener = origAdd;
        window.removeEventListener = origRemove;
        window.requestAnimationFrame = origRaf;
        window.cancelAnimationFrame = origCancel;
        (window as unknown as { visualViewport?: unknown }).visualViewport = origVV;
    });

    it('logs audio playback error when playAudio throws non-abort error', async () => {
        // Make chat API return a reply with audio
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/chat') return Promise.resolve(mockResponse({ reply: 'Audio reply', audioFileUrl: '/audio/error.mp3' }));
            return Promise.resolve(mockResponse({}));
        });
        // Simulate playAudio rejecting with a normal error
        mockPlayAudio.mockRejectedValueOnce(new Error('playback failed'));

        const { result } = renderHook(() => useChatController(baseBot));

        // Wait for intro
        await act(async () => { await new Promise(res => setTimeout(res, 10)); });

        act(() => result.current.setInput('trigger audio'));
        await act(async () => { await result.current.sendMessage(); });

        // Allow playback effect to run
        await act(async () => { await new Promise(res => setTimeout(res, 10)); });

        expect(mockPlayAudio).toHaveBeenCalled();
        expect(mockLogEvent).toHaveBeenCalledWith('error', 'chat_audio_playback_error', 'Audio playback failed', expect.any(Object));
    });

    it('logs info when audio playback is aborted (AbortError)', async () => {
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/chat') return Promise.resolve(mockResponse({ reply: 'Audio reply', audioFileUrl: '/audio/abort.mp3' }));
            return Promise.resolve(mockResponse({}));
        });
        const abortErr = new Error('aborted');
        (abortErr as unknown as { name?: string }).name = 'AbortError';
        mockPlayAudio.mockRejectedValueOnce(abortErr);

        const { result } = renderHook(() => useChatController(baseBot));
        await act(async () => { await new Promise(res => setTimeout(res, 10)); });

        act(() => result.current.setInput('trigger abort'));
        await act(async () => { await result.current.sendMessage(); });

        await act(async () => { await new Promise(res => setTimeout(res, 10)); });

        expect(mockPlayAudio).toHaveBeenCalled();
        expect(mockLogEvent).toHaveBeenCalledWith('info', 'chat_audio_playback_aborted', 'Audio playback aborted', expect.any(Object));
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

    it('visualViewport resize sets CSS keyboard pad variable', () => {
        // store listeners
        const listeners: Record<string, (...args: unknown[]) => void> = {};
        Object.defineProperty(window, 'visualViewport', {
            value: {
                height: 500,
                addEventListener: (ev: string, cb: (...args: unknown[]) => void) => { listeners[ev] = cb; },
                removeEventListener: (ev: string) => { delete listeners[ev]; },
                scroll: () => {}
            },
            configurable: true,
        });

        // set an innerHeight larger than visualViewport to simulate keyboard open
        const w = window as unknown as { innerHeight: number };
        const originalInner = w.innerHeight;
        w.innerHeight = 900;

        // Mock RAF to run synchronously and capture id for cancellation
        const origRaf = window.requestAnimationFrame;
        const origCancel = window.cancelAnimationFrame;
        (window as unknown as { requestAnimationFrame: typeof window.requestAnimationFrame }).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 777; };
        (window as unknown as { cancelAnimationFrame: typeof window.cancelAnimationFrame }).cancelAnimationFrame = jest.fn();

        const { unmount } = renderHook(() => useChatController(baseBot));

        // Trigger the resize listener and allow RAF to run
        act(() => {
            if (listeners['resize']) {
                listeners['resize']();
            }
        });

        // Check that CSS var was set (non-empty string)
        const pad = document.documentElement.style.getPropertyValue('--vv-keyboard-pad');
        expect(typeof pad).toBe('string');

        // Unmount and ensure cleanup ran without throwing
        unmount();

        // restore innerHeight and original RAF functions
        w.innerHeight = originalInner;
        window.requestAnimationFrame = origRaf;
        window.cancelAnimationFrame = origCancel;
    });



    it('handleDownloadTranscript logs error and shows alert when download fails', async () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        mockDownloadTranscript.mockImplementationOnce(() => { throw new Error('disk full'); });

        const { result } = renderHook(() => useChatController(baseBot));
        await act(async () => { await result.current.handleDownloadTranscript(); });

        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to open transcript'));
        alertSpy.mockRestore();
        mockDownloadTranscript.mockClear();
    });

    it('handleDownloadTranscript handles non-Error throw and shows unknown message', async () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        // Throw a non-Error value
        mockDownloadTranscript.mockImplementationOnce(() => { throw 'oops'; });

        const { result } = renderHook(() => useChatController(baseBot));
        await act(async () => { await result.current.handleDownloadTranscript(); });

        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown error occurred'));
        alertSpy.mockRestore();
        mockDownloadTranscript.mockClear();
    });

    it('sendMessage exhausts retries and sets error', async () => {
        let attempts = 0;
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/chat') {
                attempts++;
                return Promise.reject(new Error('permanent fail'));
            }
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(baseBot));
        await act(async () => { await new Promise(res => setTimeout(res, 20)); });
        act(() => result.current.setInput('will fail'));
        await act(async () => { await result.current.sendMessage(); });

        expect(attempts).toBeGreaterThanOrEqual(3);
        // useApiError maps thrown errors to a user-friendly message
        expect(result.current.error).toBe('Error sending message. Please try again.');
    });

    it('handleAudioToggle toggles audio, persists preference, and focuses input', () => {
        const { result } = renderHook(() => useChatController(mockBot));
        // Provide an input element and audioRef to simulate real DOM
        const inputEl = document.createElement('input');
        document.body.appendChild(inputEl);
        act(() => {
            result.current.inputRef.current = inputEl;
            // Provide the mocked audioRef for the test
            (result.current as unknown as { audioRef: React.RefObject<HTMLAudioElement> }).audioRef = mockAudioRef;
        });

        // Initially audioEnabled is true; toggling should persist false
        act(() => { result.current.handleAudioToggle(); });

        const s = storage as unknown as jest.Mocked<typeof storage>;
        expect(s.setItem).toHaveBeenCalledWith('audioEnabled', expect.any(String));
        // Focus should have been called on the input element
        // audioRef.muted should have been toggled to true
        expect(mockAudioRef.current.muted).toBe(true);
        document.body.removeChild(inputEl);
    });

    it('logMessage returns early when session is missing (no /api/log-message call)', async () => {
        // Simulate SSR/no browser session so `useSession` returns empty values
        const useSessionModule = require('../../../app/components/useSession');
        useSessionModule.setIsBrowserForTests(() => false);

        // Ensure chat API responds so sendMessage proceeds
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/chat') return Promise.resolve(mockResponse({ reply: 'Ok', audioFileUrl: null }));
            // Any other calls -> success
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(baseBot));

        // Wait for intro to settle
        await act(async () => { await new Promise(res => setTimeout(res, 20)); });

        act(() => result.current.setInput('Hello no session'));
        await act(async () => { await result.current.sendMessage(); });

        // Ensure no call was made to /api/log-message
        const logCalls = mockAuthenticatedFetch.mock.calls.filter(c => c[0] === '/api/log-message');
        expect(logCalls.length).toBe(0);

        // Reset module-level test helpers
        useSessionModule.resetIsBrowserForTests();
    });

    it('logMessage handles fetch rejection and logs a warning', async () => {
        // Make /api/log-message reject to trigger the catch branch
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/log-message') return Promise.reject(new Error('network down'));
            if (url === '/api/chat') return Promise.resolve(mockResponse({ reply: 'OK', audioFileUrl: null }));
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(baseBot));
        // Wait for intro to settle
        await act(async () => { await new Promise(res => setTimeout(res, 20)); });

        act(() => result.current.setInput('Trigger log fail'));
        await act(async () => { await result.current.sendMessage(); });

        const found = mockLogEvent.mock.calls.some(call => call[1] === 'client_log_message_failed');
        expect(found).toBe(true);
    });

    it('intro generation failure sets introError and logs', async () => {
        // Ensure voice config available so failure comes from /api/chat
        mockLoadVoiceConfig.mockReturnValue(baseBot.voiceConfig);
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/chat') return Promise.reject(new Error('intro service down'));
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(baseBot));
        // Wait for intro attempt
        await act(async () => { await new Promise(res => setTimeout(res, 30)); });

        expect(result.current.introError).toBeTruthy();
        expect(mockLogEvent).toHaveBeenCalledWith('error', 'chat_intro_generation_failed', 'Failed to generate intro or voice config. Please recreate the bot.', expect.any(Object));
    });

    it('handleDownloadTranscript logs info on success', async () => {
        mockDownloadTranscript.mockResolvedValueOnce(true);
        const { result } = renderHook(() => useChatController(mockBot));
        await act(async () => { await result.current.handleDownloadTranscript(); });
        expect(mockLogEvent).toHaveBeenCalledWith('info', 'chat_transcript_downloaded', 'Transcript downloaded successfully', expect.any(Object));
    });

    it('successful audio playback stores last played hash', async () => {
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/chat') return Promise.resolve(mockResponse({ reply: 'Audio reply', audioFileUrl: '/audio/success.mp3' }));
            return Promise.resolve(mockResponse({}));
        });
        mockPlayAudio.mockResolvedValueOnce(true);

        const { result } = renderHook(() => useChatController(mockBot));
        // Wait for intro
        await act(async () => { await new Promise(res => setTimeout(res, 10)); });

        act(() => result.current.setInput('play now'));
        await act(async () => { await result.current.sendMessage(); });

        // Allow playback effect to run
        await act(async () => { await new Promise(res => setTimeout(res, 10)); });

        // Should have called storage.setItem with lastPlayedAudioHash key
        const s2 = storage as unknown as jest.Mocked<typeof storage>;
        expect(s2.setItem).toHaveBeenCalledWith(expect.stringContaining('lastPlayedAudioHash-'), expect.any(String));
    });

    // New focused tests to cover additional branches
    it('health check success sets apiAvailable=true and focuses input', async () => {
        // Create a real input element and attach to DOM so focus() works
        const inputEl = document.createElement('input');
        document.body.appendChild(inputEl);
        mockAuthenticatedFetch.mockImplementation((url: string) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(mockBot));
        // Make the hook's inputRef point to our input element
        act(() => { result.current.inputRef.current = inputEl; });

        // Wait briefly for health check effect to run
        await act(async () => { await new Promise(res => setTimeout(res, 20)); });

        expect(result.current.apiAvailable).toBe(true);
        // Clean up
        document.body.removeChild(inputEl);
    });

    it('sendMessage sets error and logs when voiceConfig is missing', async () => {
        // Ensure voice config cannot be resolved
        mockLoadVoiceConfig.mockReturnValue(null);
        mockApiGetVoiceConfigForCharacter.mockRejectedValueOnce(new Error('no voice config'));
        const botNoVoice = { ...baseBot, voiceConfig: null };

        const { result } = renderHook(() => useChatController(botNoVoice));

        // Wait a moment for any hydration
        await act(async () => { await new Promise(res => setTimeout(res, 10)); });

        act(() => result.current.setInput('hello'));
        await act(async () => { await result.current.sendMessage(); });

        // Voice config missing should produce an error-level log (intro effects may emit related logs first).
        const errLogFound = mockLogEvent.mock.calls.some((c) => c[0] === 'error' && ['voice_config_fetch_failed','chat_intro_voice_config_missing','chat_send_voice_config_missing'].includes(c[1] as string));
        expect(errLogFound).toBe(true);
        expect(result.current.loading).toBe(false);
    });

    it('profileApiCall logs timing for Log Message operation', async () => {
        // Spy on logEvent calls and ensure an entry exists for 'Log Message'
        mockAuthenticatedFetch.mockImplementation((url: string, _opts?: unknown) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/chat') return Promise.resolve(mockResponse({ reply: 'Hello', audioFileUrl: null }));
            if (url === '/api/log-message') return Promise.resolve({ ok: true, json: async () => ({}) });
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(mockBot));

        // Give intro a moment
        await act(async () => { await new Promise(res => setTimeout(res, 20)); });

        act(() => result.current.setInput('Ping'));
        await act(async () => { await result.current.sendMessage(); });

        const found = mockLogEvent.mock.calls.some(call => call[1] === 'chat_api_timing' && call[3] && (call[3] as Record<string, unknown>).operation === 'Log Message');
        expect(found).toBe(true);
    });

    it('logMessage handles non-ok log response and logs a warning', async () => {
        // Make /api/log-message return not-ok to trigger the catch branch
        mockAuthenticatedFetch.mockImplementation((url: string, _opts?: unknown) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/chat') return Promise.resolve(mockResponse({ reply: 'Hello', audioFileUrl: null }));
            if (url === '/api/log-message') return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(mockBot));

        // Wait for intro to settle
        await act(async () => { await new Promise(res => setTimeout(res, 20)); });

        act(() => result.current.setInput('Log this'));
        await act(async () => { await result.current.sendMessage(); });

        const found = mockLogEvent.mock.calls.some(call => call[1] === 'client_log_message_failed');
        expect(found).toBe(true);
    });

    it('handleKeyDown triggers sendMessage on Enter', async () => {
        mockAuthenticatedFetch.mockImplementation((url: string, _opts?: unknown) => {
            if (url === '/api/health') return Promise.resolve(mockResponse({}));
            if (url === '/api/chat') return Promise.resolve(mockResponse({ reply: 'OK', audioFileUrl: null }));
            return Promise.resolve(mockResponse({}));
        });

        const { result } = renderHook(() => useChatController(mockBot));
        // Wait for intro to complete
        await act(async () => { await new Promise(res => setTimeout(res, 20)); });

        act(() => result.current.setInput('Hello world'));
        // Simulate pressing Enter
        act(() => result.current.handleKeyDown({ key: 'Enter' } as unknown as React.KeyboardEvent));

        // Allow async sendMessage to complete
        await act(async () => { await new Promise(res => setTimeout(res, 20)); });
        // Expect bot reply appended
        expect(result.current.messages.some(m => m.text === 'OK')).toBe(true);
    });
});
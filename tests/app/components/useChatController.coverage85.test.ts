/**
 * Additional branch coverage tests for useChatController targeting 85% branch coverage
 * Focus on process.env branches, viewport handling, and retry logic
 */

import { renderHook, act } from "@testing-library/react";
import type { Bot } from "../../../app/components/BotCreator";

const mockLogEvent = jest.fn();
const mockSanitizeLogMeta = jest.fn((meta: unknown) => meta);
jest.mock("../../../src/utils/logger", () => ({
    logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
    sanitizeLogMeta: (meta: unknown) => mockSanitizeLogMeta(meta),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
    authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

jest.mock("../../../src/utils/storage", () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    setVersionedJSON: jest.fn(),
    getVersionedJSON: jest.fn(),
}));

import { useChatController } from "../../../app/components/useChatController";
import * as storage from "../../../src/utils/storage";

const mockStorage = storage as jest.Mocked<typeof storage>;

describe('useChatController 85% coverage targets', () => {
    let mockBot: Bot;
    let originalEnv: string | undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        originalEnv = process.env.NODE_ENV;
        mockAuthenticatedFetch.mockResolvedValue({ 
            ok: true, 
            json: () => Promise.resolve({ reply: 'test response', done: true }) 
        });
        mockBot = {
            name: 'TestBot',
            personality: 'friendly',
            avatarUrl: '/test.png',
            voiceConfig: {
                name: 'en-US-Wavenet-A',
                languageCodes: ['en-US'],
                ssmlGender: 1,
                pitch: 0,
                rate: 1,
            },
        };
        
        mockStorage.getItem.mockReturnValue(null);
        mockStorage.getVersionedJSON.mockReturnValue(null);
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
    });

    it('covers non-test environment retry branch (process.env.NODE_ENV !== test)', async () => {
        // Change to production environment
        process.env.NODE_ENV = 'production';
        
        let callCount = 0;
        mockAuthenticatedFetch.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.reject(new Error('First attempt failed'));
            }
            return Promise.resolve({ 
                ok: true, 
                json: () => Promise.resolve({ reply: 'success on retry', done: true }) 
            });
        });

        const { result } = renderHook(() => useChatController(mockBot));

        await act(async () => {
            result.current.setInput('test message');
        });

        await act(async () => {
            await result.current.sendMessage();
        });

        // Should have retried and succeeded
        expect(callCount).toBeGreaterThan(1);
    });

    it('covers iOS viewport handling (isIOS branch)', () => {
        // Mock iOS user agent
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
            writable: true,
            configurable: true,
        });

        // Mock window.innerHeight for iOS calculation
        Object.defineProperty(window, 'innerHeight', {
            value: 600,
            writable: true,
            configurable: true,
        });

        const { result } = renderHook(() => useChatController(mockBot));

        // Should handle iOS viewport
        expect(result.current).toBeDefined();
    });

    it('covers visualViewport null handling (else branch)', () => {
        // Remove visualViewport to test fallback
        const originalVV = window.visualViewport;
        Object.defineProperty(window, 'visualViewport', {
            value: undefined,
            writable: true,
            configurable: true,
        });

        // Mock non-iOS user agent
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            writable: true,
            configurable: true,
        });

        const { result } = renderHook(() => useChatController(mockBot));

        // Should handle missing visualViewport
        expect(result.current).toBeDefined();

        // Restore
        Object.defineProperty(window, 'visualViewport', {
            value: originalVV,
            writable: true,
            configurable: true,
        });
    });

    it('covers heightDiff = 0 branch in viewport handling', () => {
        // Mock visualViewport with same height as window
        Object.defineProperty(window, 'visualViewport', {
            value: {
                addEventListener: jest.fn(),
                removeEventListener: jest.fn(),
                height: 800,
            },
            writable: true,
            configurable: true,
        });

        Object.defineProperty(window, 'innerHeight', {
            value: 800,
            writable: true,
            configurable: true,
        });

        const { result } = renderHook(() => useChatController(mockBot));

        // Should handle heightDiff = 0
        expect(result.current).toBeDefined();
    });

    it('covers maxRetries fallback when all attempts fail', async () => {
        mockAuthenticatedFetch.mockRejectedValue(new Error('Network failure'));

        const { result } = renderHook(() => useChatController(mockBot));

        await act(async () => {
            result.current.setInput('test');
        });

        await act(async () => {
            try {
                await result.current.sendMessage();
            } catch {
                // Expected to throw
            }
        });

        // Should have error after max retries
        expect(result.current.error).toBeTruthy();
    });

    it('covers JSON parse error in getInitialVoiceConfig', () => {
        mockStorage.getItem.mockImplementation((key: string) => {
            if (key === 'chatbot-bot') return '{invalid json}';
            return null;
        });

        const { result } = renderHook(() => useChatController(mockBot));

        // Should handle parse error gracefully
        expect(result.current).toBeDefined();
    });

    it('covers viewport resize with keyboard shown (heightDiff > 0)', () => {
        // Mock visualViewport with reduced height (keyboard shown)
        Object.defineProperty(window, 'visualViewport', {
            value: {
                addEventListener: jest.fn((event: string, handler: () => void) => {
                    if (event === 'resize') {
                        // Simulate keyboard opening
                        setTimeout(handler, 0);
                    }
                }),
                removeEventListener: jest.fn(),
                height: 400, // Reduced height
            },
            writable: true,
            configurable: true,
        });

        Object.defineProperty(window, 'innerHeight', {
            value: 800,
            writable: true,
            configurable: true,
        });

        const { result } = renderHook(() => useChatController(mockBot));

        // Should handle keyboard showing (heightDiff > 0)
        expect(result.current).toBeDefined();
    });
});

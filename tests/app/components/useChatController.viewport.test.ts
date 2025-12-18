import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatController } from '../../../app/components/useChatController';

// Mocks used across tests
const mockAuthenticatedFetch = jest.fn();
jest.mock('../../../src/utils/api', () => ({ authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])) }));

const mockLoadVoiceConfig = jest.fn();
jest.mock('../../../src/utils/voiceConfigPersistence', () => ({ loadVoiceConfig: (...args: unknown[]) => mockLoadVoiceConfig(...(args as unknown[])), persistVoiceConfig: jest.fn() }));

const mockPlayAudio = jest.fn();
const mockStopAudio = jest.fn();
const mockIsAudioPlaying = jest.fn();
const mockAudioRef = { current: { muted: false } } as unknown as React.RefObject<HTMLAudioElement>;
jest.mock('../../../app/components/useAudioPlayer', () => ({ useAudioPlayer: () => ({ playAudio: mockPlayAudio, stopAudio: mockStopAudio, isAudioPlaying: mockIsAudioPlaying, audioRef: mockAudioRef }) }));

const mockApiGetVoiceConfigForCharacter = jest.fn();
jest.mock('../../../app/components/api_getVoiceConfigForCharacter', () => ({ api_getVoiceConfigForCharacter: (...args: unknown[]) => mockApiGetVoiceConfigForCharacter(...(args as unknown[])) }));

const mockLogEvent = jest.fn();
jest.mock('../../../src/utils/logger', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => m }));

import type { Bot } from '../../../app/components/BotCreator';

const baseBot: Bot = {
  name: 'Gandalf',
  personality: 'wise',
  avatarUrl: '/silhouette.svg',
  voiceConfig: { languageCodes: ['en-US'], name: 'en-US-Wavenet-D', ssmlGender: 1, pitch: 0, rate: 1.0, type: 'Wavenet' },
};

beforeEach(() => {
  jest.clearAllMocks();
  // default health check to resolve
  mockAuthenticatedFetch.mockImplementation((url: string) => {
    if (url === '/api/health') return Promise.resolve({ ok: true, json: async () => ({}) });
    if (url === '/api/chat') return Promise.resolve({ ok: true, json: async () => ({ reply: 'hi' }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  mockLoadVoiceConfig.mockReturnValue(baseBot.voiceConfig);
  mockApiGetVoiceConfigForCharacter.mockResolvedValue(baseBot.voiceConfig);
});

describe('useChatController viewport and focus behavior', () => {
  it('visualViewport fallback for iOS sets CSS pad and scrolls chat to bottom', async () => {
    // Ensure visualViewport is undefined for the fallback path
    // and simulate iOS user agent
    // Store original values to restore
    const win = window as Window & { visualViewport?: VisualViewport };
    const originalVV = win.visualViewport;
    const originalUA = navigator.userAgent;

    // remove visualViewport for the fallback path
    delete (win as unknown as { visualViewport?: unknown }).visualViewport;
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)', configurable: true });

    // Render a TestHost that attaches the hook's refs to real DOM nodes during initial render
    const TestHost = (props: { botProp: Bot }) => {
      const ctrl = useChatController(props.botProp);
      return React.createElement(React.Fragment, null,
        React.createElement('div', { 'data-testid': 'chat', ref: ctrl.chatBoxRef }),
        React.createElement('input', { 'data-testid': 'input', ref: ctrl.inputRef })
      );
    };

    // Render with attached refs so effect runs with refs present
    const { getByTestId, unmount } = require('@testing-library/react').render(React.createElement(TestHost, { botProp: baseBot }));

    // Grab elements and make scrollHeight predictable
    const chatEl = getByTestId('chat');
    Object.defineProperty(chatEl, 'scrollHeight', { value: 2000, configurable: true });
    chatEl.scrollTop = 0;

    const inputEl = getByTestId('input') as HTMLInputElement;

    // Simulate focusing once to capture initialInnerHeight
    const initialInner = 800;
    Object.defineProperty(window, 'innerHeight', { value: initialInner, configurable: true });

    // Mock window.scrollTo (jsdom doesn't implement it fully) to avoid Not implemented errors
    (window as unknown as { scrollTo: (...args: unknown[]) => void }).scrollTo = jest.fn();
    act(() => {
      inputEl.dispatchEvent(new Event('focus'));
    });

    // Shrink window to simulate keyboard and trigger a resize event
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });

    // Make requestAnimationFrame synchronous for this test so scheduled viewport changes run deterministically
    const originalRaf = window.requestAnimationFrame;
    (window as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0 as unknown as number; };

    act(() => {
      inputEl.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('resize'));
    });

    const root = document.documentElement;

    // Wait for the CSS variable to be set and classes applied (avoid flaky timing)
    await waitFor(() => {
      const pad = parseInt(root.style.getPropertyValue('--vv-keyboard-pad') || '0', 10);
      expect(pad).toBeGreaterThan(0);
      expect(root.classList.contains('mobile-keyboard-open') || root.classList.contains('ff-android-input-focus')).toBe(true);
      // Chat element should have been scrolled to bottom
      expect(chatEl.scrollTop).toBe(chatEl.scrollHeight);
    }, { timeout: 500 });

    // Restore RAF
    (window as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame = originalRaf;

    // cleanup
    unmount();
    Object.defineProperty(navigator, 'userAgent', { value: originalUA });
    // restore visualViewport
    (window as Window & { visualViewport?: VisualViewport }).visualViewport = originalVV;
  });

  it('safeFocus does not call focus when input is not in document', async () => {
    // Make health check delayed so we can set inputRef before it resolves
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === '/api/health') return new Promise((res) => setTimeout(() => res({ ok: true, json: async () => ({}) }), 30));
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const { result } = renderHook(() => useChatController(baseBot));

    // Create an input element but do NOT append to document (not in DOM)
    const input = document.createElement('input');
    // Spy on the prototype focus to capture calls without needing to attach to the DOM
    const focusSpy = jest.spyOn(HTMLInputElement.prototype, 'focus').mockImplementation(() => undefined as unknown as void);

    // Attach to hook's ref before health check resolves
    act(() => {
      result.current.inputRef.current = input;
    });

    // Wait for health check to resolve
    await new Promise((r) => setTimeout(r, 60));

    // Focus should not have been called because element is not in the document
    expect(focusSpy).not.toHaveBeenCalled();

    focusSpy.mockRestore();
  });
});

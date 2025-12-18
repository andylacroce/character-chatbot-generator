import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import { useChatController } from '../../../app/components/useChatController';
import storage from '../../../src/utils/storage';

const mockPlayAudio = jest.fn();
const mockStopAudio = jest.fn();
const mockAudioRef = { current: { muted: false } } as unknown as React.RefObject<HTMLAudioElement>;
jest.mock('../../../app/components/useAudioPlayer', () => ({ useAudioPlayer: () => ({ playAudio: mockPlayAudio, stopAudio: mockStopAudio, isAudioPlaying: () => false, audioRef: mockAudioRef }) }));

const mockAuthenticatedFetch = jest.fn();
jest.mock('../../../src/utils/api', () => ({ authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])) }));

const baseBot = {
  name: 'ProdBot',
  personality: 'stern',
  avatarUrl: '/silhouette.svg',
  voiceConfig: { languageCodes: ['en-US'], name: 'en-US-Wavenet-D', ssmlGender: 1, pitch: 0, rate: 1.0, type: 'Wavenet' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthenticatedFetch.mockImplementation((url: string) => {
    if (url === '/api/health') return Promise.resolve({ ok: true, json: async () => ({}) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

afterEach(() => {
  try { storage.setItem(`chatbot-history-${baseBot.name}`, JSON.stringify([])); } catch {};
});

describe('useChatController production and mobile branches', () => {
  it('uses real setTimeout backoff path when NODE_ENV=production', async () => {
    const origEnv = process.env.NODE_ENV;
    (process.env as unknown as { NODE_ENV?: string }).NODE_ENV = 'production';

    // First call to /api/chat will reject to trigger retry; second will succeed
    let call = 0;
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === '/api/health') return Promise.resolve({ ok: true, json: async () => ({}) });
      if (url === '/api/chat') {
        call += 1;
        if (call === 1) return Promise.reject(new Error('server error'));
        return Promise.resolve({ ok: true, json: async () => ({ reply: 'ok', audioFileUrl: null }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const { result } = renderHook(() => useChatController(baseBot));

    // spy on global setTimeout and make callbacks immediate so test does not wait
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb: (...args: unknown[]) => void, _delay?: number) => { cb(); return 0 as unknown as NodeJS.Timeout; });

    // set input and call sendMessage
    act(() => { result.current.setInput('hello'); });

    await act(async () => { await result.current.sendMessage(); });

    expect(setTimeoutSpy).toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
    (process.env as unknown as { NODE_ENV?: string }).NODE_ENV = origEnv;
  });

  it('onFocus triggers window.scrollTo on mobile UA and sets CSS pad', async () => {
    // Simulate Android UA and no visualViewport
    const originalVV = (window as unknown as { visualViewport?: unknown }).visualViewport;
    const originalUA = navigator.userAgent;
    delete (window as unknown as { visualViewport?: unknown }).visualViewport;
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)', configurable: true });

    // Prepare DOM
    document.body.style.height = '2000px';
    Object.defineProperty(document.body, 'scrollHeight', { value: 2000, configurable: true });
    const scrollSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});

    // Render TestHost to attach refs
    const TestHost = (props: { bot: typeof baseBot }) => {
      const ctrl = useChatController(props.bot);
      return React.createElement(React.Fragment, null,
        React.createElement('div', { 'data-testid': 'chat', ref: ctrl.chatBoxRef }),
        React.createElement('input', { 'data-testid': 'input', ref: ctrl.inputRef })
      );
    };

    const { getByTestId, unmount } = render(React.createElement(TestHost, { bot: baseBot }));
    const input = getByTestId('input') as HTMLInputElement;
    const root = document.documentElement;

    // set an initial height then simulate keyboard opening
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
    act(() => { input.dispatchEvent(new Event('focus')); });

    // keyboard reduces innerHeight
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });

    // advance timers for the delayed handler; use real timers but force immediate execution of timeouts
    await new Promise((r) => setTimeout(r, 100));

    // Assert that scrollTo was invoked and CSS var set
    expect(scrollSpy).toHaveBeenCalledWith(0, document.body.scrollHeight);
    const pad = parseInt(root.style.getPropertyValue('--vv-keyboard-pad') || '0', 10);
    expect(pad).toBeGreaterThan(0);

    act(() => { input.dispatchEvent(new Event('blur')); });

    await waitFor(() => {
      const pad2 = parseInt(root.style.getPropertyValue('--vv-keyboard-pad') || '0', 10);
      expect(pad2).toBe(0);
    });

    scrollSpy.mockRestore();
    Object.defineProperty(navigator, 'userAgent', { value: originalUA });
    (window as unknown as { visualViewport?: unknown }).visualViewport = originalVV;
    unmount();
  });
});

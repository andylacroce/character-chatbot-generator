import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import { useChatController } from '../../../app/components/useChatController';
import storage from '../../../src/utils/storage';

// Reuse existing mocks from other tests (jest.mock calls in other files affect Jest runtime)
const mockPlayAudio = jest.fn();
const mockStopAudio = jest.fn();
const mockAudioRef = { current: { muted: false } } as unknown as React.RefObject<HTMLAudioElement>;
jest.mock('../../../app/components/useAudioPlayer', () => ({ useAudioPlayer: () => ({ playAudio: mockPlayAudio, stopAudio: mockStopAudio, isAudioPlaying: () => false, audioRef: mockAudioRef }) }));

const mockAuthenticatedFetch = jest.fn();
jest.mock('../../../src/utils/api', () => ({ authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])) }));

const baseBot = {
  name: 'Gandalf',
  personality: 'wise',
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
  try { storage.setItem(`lastPlayedAudioHash-${baseBot.name}`, ''); } catch {};
});

describe('useChatController additional small branches', () => {
  it('does not attempt audio playback when lastPlayedAudioHash already matches', async () => {
    // Create a bot reply message and pre-seed history and last played hash
    const msg = { sender: baseBot.name, text: 'hello', audioFileUrl: 'https://audio.test/foo.mp3' };
    const hash = `${msg.sender}__${msg.text}__${msg.audioFileUrl}`;

    // Seed history and last played hash in storage before mounting
    const spy = jest.spyOn(storage, 'getItem').mockImplementation((key: string) => {
      if (key === `chatbot-history-${baseBot.name}`) return JSON.stringify([msg]);
      if (key === `lastPlayedAudioHash-${baseBot.name}`) return hash;
      return null as unknown as string | null;
    });

    renderHook(() => useChatController(baseBot));

    // Allow hook effects to run
    await new Promise((r) => setTimeout(r, 20));

    // Because last played hash matches, playAudio should not be called
    expect(mockPlayAudio).not.toHaveBeenCalled();

    // Restore spy
    spy.mockRestore();
  });

  it('blur resets CSS pad and classes for visualViewport fallback', async () => {
    // Simulate no visualViewport and iOS UA
    const win = window as Window & { visualViewport?: VisualViewport };
    const originalVV = win.visualViewport;
    const originalUA = navigator.userAgent;
    delete (win as unknown as { visualViewport?: unknown }).visualViewport;
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)', configurable: true });

    // Render a host that attaches refs
    const TestHost = (props: { bot: typeof baseBot }) => {
      const ctrl = useChatController(props.bot);
      return React.createElement(React.Fragment, null,
        React.createElement('div', { 'data-testid': 'chat', ref: ctrl.chatBoxRef }),
        React.createElement('input', { 'data-testid': 'input', ref: ctrl.inputRef })
      );
    };

    const { getByTestId, unmount } = render(React.createElement(TestHost, { bot: baseBot }));
    const root = document.documentElement;
    const input = getByTestId('input') as HTMLInputElement;

    // Focus to set initial height and then simulate keyboard open
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    act(() => { input.dispatchEvent(new Event('focus')); });

    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true });
    // Trigger focus then blur
    act(() => { input.dispatchEvent(new Event('focus')); });

    // Wait for effect that sets pad
    await waitFor(() => expect(parseInt(root.style.getPropertyValue('--vv-keyboard-pad') || '0', 10)).toBeGreaterThanOrEqual(0));

    act(() => { input.dispatchEvent(new Event('blur')); });

    // After blur, pad should be cleared and classes removed
    await waitFor(() => {
      const pad = parseInt(root.style.getPropertyValue('--vv-keyboard-pad') || '0', 10);
      expect(pad).toBe(0);
      expect(root.classList.contains('mobile-keyboard-open')).toBe(false);
      expect(root.classList.contains('ff-android-input-focus')).toBe(false);
    });

    unmount();
    Object.defineProperty(navigator, 'userAgent', { value: originalUA });
    (window as Window & { visualViewport?: VisualViewport }).visualViewport = originalVV;
  });

  it('handleHeaderLinkClick focuses the input when present', async () => {
    const { result } = renderHook(() => useChatController(baseBot));

    // Attach input element to DOM and to the ref
    const inputEl = document.createElement('input');
    document.body.appendChild(inputEl);
    act(() => { result.current.inputRef.current = inputEl; });

    const focusSpy = jest.spyOn(inputEl, 'focus');

    act(() => { result.current.handleHeaderLinkClick(); });
    expect(focusSpy).toHaveBeenCalled();

    focusSpy.mockRestore();
    document.body.removeChild(inputEl);
  });

  it('stopAudio is called when hook unmounts', async () => {
    const TestHost = (props: { bot: typeof baseBot }) => {
      useChatController(props.bot);
      return React.createElement('div');
    };

    const { unmount } = render(React.createElement(TestHost, { bot: baseBot }));

    // Unmount should call stopAudio via cleanup effect
    act(() => { unmount(); });
    expect(mockStopAudio).toHaveBeenCalled();
  });

  it('handleScroll schedules a single RAF when called rapidly', async () => {
    // Create many messages so visibleCount < messages.length
    const msgs = Array.from({ length: 40 }).map((_, i) => ({ sender: i % 2 ? 'User' : baseBot.name, text: `msg${i}` }));
    (storage as unknown as { getItem: (k: string) => string | null }).getItem = (key: string) => {
      if (key === `chatbot-history-${baseBot.name}`) return JSON.stringify(msgs);
      return null;
    };

    const { result } = renderHook(() => useChatController(baseBot));

    // Assign chat element and make it scrolled to top
    const chatEl = document.createElement('div');
    Object.defineProperty(chatEl, 'scrollHeight', { value: 2000, configurable: true });
    chatEl.scrollTop = 0;
    act(() => { result.current.chatBoxRef.current = chatEl; });

    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });

    act(() => {
      result.current.handleScroll();
      result.current.handleScroll();
    });

    // requestAnimationFrame should have been scheduled only once due to early-return
    expect(rafSpy).toHaveBeenCalledTimes(1);

    rafSpy.mockRestore();
  });
});

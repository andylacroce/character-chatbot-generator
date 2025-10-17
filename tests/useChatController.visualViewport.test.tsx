import { render, act } from '@testing-library/react';

// Mock storage and audio player
jest.mock('../src/utils/storage', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  clearMemoryFallback: jest.fn(),
  setVersionedJSON: jest.fn(),
}));
jest.mock('../app/components/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    playAudio: jest.fn(),
    stopAudio: jest.fn(),
  }),
}));

import { useChatController } from '../app/components/useChatController';

const mockBot = {
  name: 'VVBot',
  personality: 'neutral',
  avatarUrl: '/silhouette.svg',
  voiceConfig: undefined,
};

describe('useChatController visualViewport keyboard handling', () => {
  beforeEach(() => {
    jest.resetModules();
    // Ensure a clean document root
    document.documentElement.className = '';
    document.documentElement.style.removeProperty('--vv-keyboard-pad');
  });

  it('sets --vv-keyboard-pad and classes on focus when visualViewport shrinks and removes them on blur', async () => {
    // Create a mock visualViewport implementation that stores listeners
    const listeners: Record<string, EventListener[]> = {};
    // @ts-ignore
    global.window.visualViewport = {
      height: 600,
      addEventListener: (ev: string, cb: EventListener) => {
        listeners[ev] = listeners[ev] || [];
        listeners[ev].push(cb);
      },
      removeEventListener: (ev: string, cb: EventListener) => {
        listeners[ev] = (listeners[ev] || []).filter(f => f !== cb);
      }
    } as any;

    // Ensure an innerHeight greater than visualViewport.height
    // @ts-ignore
    global.window.innerHeight = 1000;

    // Render a harness component that attaches the hook's refs to real DOM elements
    function Harness() {
      const ctrl = useChatController(mockBot as any);
      return (
        <div>
          <div data-testid="chat" ref={ctrl.chatBoxRef as any} />
          <input data-testid="input" ref={ctrl.inputRef as any} />
        </div>
      );
    }

    const { getByTestId } = render(<Harness />);
    const inputEl = getByTestId('input') as HTMLInputElement;
    const chatEl = getByTestId('chat') as HTMLDivElement;
    // scrollHeight is read-only; define it
    Object.defineProperty(chatEl, 'scrollHeight', { value: 2000, configurable: true });
    chatEl.scrollTop = 0;

    act(() => {
      // Dispatch focus to trigger the hook's focus listener
      inputEl.dispatchEvent(new Event('focus'));
    });

    // Wait for the 50ms timeout in the hook
    await new Promise(res => setTimeout(res, 80));

    const pad = document.documentElement.style.getPropertyValue('--vv-keyboard-pad');
    expect(pad).toBeTruthy();
    expect(document.documentElement.classList.contains('mobile-keyboard-open') || document.documentElement.classList.contains('ff-android-input-focus')).toBe(true);

    // Simulate blur
    act(() => {
      inputEl.dispatchEvent(new Event('blur'));
    });

    // Wait a tick for blur cleanup
    await new Promise(res => setTimeout(res, 10));

  const clearedPad = document.documentElement.style.getPropertyValue('--vv-keyboard-pad');
  expect(['', '0px']).toContain(clearedPad);
    expect(document.documentElement.classList.contains('mobile-keyboard-open')).toBe(false);
  });
});

import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatScrollAndFocus } from '../../../app/components/useChatScrollAndFocus';

describe('useChatScrollAndFocus', () => {
  beforeEach(() => {
    // Ensure we run timers deterministically
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.resetAllMocks();
    // restore userAgent if mutated
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).navigator = (global as any).navigator || {};
  });

  it('auto-scrolls to bottom when messages length increases', async () => {
    const chatBox = document.createElement('div');
    // simulate a tall container
    Object.defineProperty(chatBox, 'scrollHeight', { value: 1000, configurable: true });
    chatBox.scrollTop = 0;

    const chatBoxRef = { current: chatBox } as React.RefObject<HTMLDivElement>;
    const input = document.createElement('input');
    const inputRef = { current: input } as React.RefObject<HTMLInputElement>;

    const { rerender } = renderHook(
      ({ messages }) => useChatScrollAndFocus({ chatBoxRef, inputRef, messages, loading: false }),
      { initialProps: { messages: [] as unknown[] } }
    );

    // add a message (increase length) - the hook should schedule a scroll
    rerender({ messages: [1] });

    await waitFor(() => expect(chatBox.scrollTop).toBe(1000));
  });

  it('focuses input on mount (test env focuses synchronously)', () => {
    const chatBox = document.createElement('div');
    const chatBoxRef = { current: chatBox } as React.RefObject<HTMLDivElement>;

    const input = document.createElement('input');
    // append to DOM so document.contains(el) check passes
    document.body.appendChild(input);
    const inputRef = { current: input } as React.RefObject<HTMLInputElement>;

    const focusSpy = jest.spyOn(input, 'focus');

    renderHook(() => useChatScrollAndFocus({ chatBoxRef, inputRef, messages: [], loading: false }));

    expect(focusSpy).toHaveBeenCalled();

    document.body.removeChild(input);
  });



  it('handles window resize by scrolling to bottom', () => {
    const chatBox = document.createElement('div');
    Object.defineProperty(chatBox, 'scrollHeight', { value: 700, configurable: true });
    chatBox.scrollTop = 0;

    const chatBoxRef = { current: chatBox } as React.RefObject<HTMLDivElement>;
    const inputRef = { current: null } as React.RefObject<HTMLInputElement | null>;

    // Provide a scrollTo implementation (not available in JSDOM by default)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chatBox as any).scrollTo = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollSpy = (chatBox as any).scrollTo as jest.Mock;

    renderHook(() => useChatScrollAndFocus({ chatBoxRef, inputRef, messages: [1,2,3], loading: false }));

    act(() => { window.dispatchEvent(new Event('resize')); });

    expect(scrollSpy).toHaveBeenCalled();
  });
});
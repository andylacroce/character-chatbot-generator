import React from "react";
import { render, act } from "@testing-library/react";
import { useChatScrollAndFocus } from "../../../app/components/useChatScrollAndFocus";

function setup({ messages: _messages = [], loading: _loading = false } = {}) {
  const chatBoxRef = React.createRef<HTMLDivElement>();
  const inputRef = React.createRef<HTMLInputElement>();
  function TestComponent({ messages, loading }: { messages: unknown[]; loading: boolean }) {
    // Cast refs to match the expected types in the hook
    useChatScrollAndFocus({
      chatBoxRef: chatBoxRef as React.RefObject<HTMLDivElement>,
      inputRef: inputRef as React.RefObject<HTMLInputElement | null>,
      messages,
      loading,
    });
    return (
      <>
        <div ref={chatBoxRef} data-testid="chatbox" style={{ height: 100, overflow: 'auto' }} />
        <input ref={inputRef} data-testid="input" />
      </>
    );
  }
  return { chatBoxRef, inputRef, TestComponent };
}

describe("useChatScrollAndFocus", () => {
  function setScrollProps(el: HTMLElement, { scrollHeight = 0, scrollTop = 0 } = {}) {
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
      set: () => {},
    });
    let _scrollTop = scrollTop;
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => _scrollTop,
      set: v => { _scrollTop = v; },
    });
  }

  it("scrolls to bottom when messages change", () => {
    jest.useFakeTimers();
    const { TestComponent, chatBoxRef } = setup();
    const { rerender } = render(<TestComponent messages={[]} loading={false} />);
    if (chatBoxRef.current) {
      setScrollProps(chatBoxRef.current, { scrollHeight: 500, scrollTop: 0 });
    }
    rerender(<TestComponent messages={[{ id: 1, text: "hi" }]} loading={false} />);
    
    // Fast-forward timers to trigger the setTimeout
    act(() => {
      jest.runAllTimers();
    });
    
    expect(chatBoxRef.current?.scrollTop).toBe(chatBoxRef.current?.scrollHeight);
    jest.useRealTimers();
  });

  it("focuses input on mount", () => {
    const { TestComponent, inputRef } = setup();
    render(<TestComponent messages={[]} loading={false} />);
    expect(document.activeElement).toBe(inputRef.current);
  });

  it("focuses input after loading completes", () => {
    const { TestComponent, inputRef } = setup();
    const { rerender } = render(<TestComponent messages={[]} loading={true} />);
    rerender(<TestComponent messages={[]} loading={false} />);
    expect(document.activeElement).toBe(inputRef.current);
  });

  it("scrolls to bottom on window resize", () => {
    const { TestComponent, chatBoxRef } = setup();
    render(<TestComponent messages={[]} loading={false} />);
    if (chatBoxRef.current) {
      setScrollProps(chatBoxRef.current, { scrollHeight: 1234, scrollTop: 0 });
    }
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(chatBoxRef.current?.scrollTop).toBe(chatBoxRef.current?.scrollHeight);
  });

  it("on mobile resize with focused input also scrolls page", () => {
    jest.useFakeTimers();
    const origUA = window.navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true
    });
    const { TestComponent, inputRef, chatBoxRef } = setup();
    render(<TestComponent messages={[]} loading={false} />);
    const input = inputRef.current!;
    // Prepare chatBox scroll values
    if (chatBoxRef.current) {
      setScrollProps(chatBoxRef.current, { scrollHeight: 2000, scrollTop: 0 });
    }
    // Mock window.scrollTo to observe calls
    const originalScrollTo = window.scrollTo;
    window.scrollTo = jest.fn();
    // Focus input to activate mobile path
    act(() => {
      input.dispatchEvent(new FocusEvent("focus"));
      // advance timers for delayed focus logic
      jest.advanceTimersByTime(130);
    });
    const initialCalls = (window.scrollTo as jest.Mock).mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect((window.scrollTo as jest.Mock).mock.calls.length).toBeGreaterThan(initialCalls);
    // Clean up
    window.scrollTo = originalScrollTo;
    Object.defineProperty(window.navigator, "userAgent", { value: origUA, configurable: true });
    jest.useRealTimers();
  });

  it("handles focus/blur events on input (non-Firefox Android)", () => {
    const { TestComponent, inputRef } = setup();
    render(<TestComponent messages={[]} loading={false} />);
    const input = inputRef.current!;
    act(() => {
      input.dispatchEvent(new FocusEvent("focus"));
      input.dispatchEvent(new FocusEvent("blur"));
    });
    // No errors, no class added/removed
    expect(document.body.classList.contains("ff-android-input-focus")).toBe(false);
  });

  it("handles Firefox Android visualViewport logic", () => {
    // Mock userAgent and visualViewport
    const origUA = window.navigator.userAgent;
    const origVV = window.visualViewport;
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (Android; Mobile; rv:89.0) Gecko/89.0 Firefox/89.0",
      configurable: true
    });
    // Minimal visualViewport mock
    (window as unknown as { visualViewport?: { addEventListener?: jest.Mock; removeEventListener?: jest.Mock } }).visualViewport = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    const { TestComponent, chatBoxRef: _chatBoxRef } = setup();
    render(<TestComponent messages={[]} loading={false} />);
    expect((window.visualViewport as unknown as { addEventListener: jest.Mock }).addEventListener.mock.calls[0][0]).toBe("resize");
    // Clean up
    Object.defineProperty(window.navigator, "userAgent", { value: origUA, configurable: true });
  Object.defineProperty(window, 'visualViewport', { value: origVV, configurable: true });
  });

  it("handles focus/blur events on input (Firefox Android)", () => {
    jest.useFakeTimers();
    // Mock userAgent
    const origUA = window.navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (Android; Mobile; rv:89.0) Gecko/89.0 Firefox/89.0",
      configurable: true
    });
    const { TestComponent, inputRef } = setup();
    render(<TestComponent messages={[]} loading={false} />);
    const input = inputRef.current!;
    // Mock scrollIntoView, scrollTo, and classList
    input.scrollIntoView = jest.fn();
    window.scrollTo = jest.fn();
    document.body.classList.add = jest.fn();
    document.body.classList.remove = jest.fn();
    act(() => {
      input.dispatchEvent(new FocusEvent("focus"));
      jest.runAllTimers();
    });
    expect(input.scrollIntoView).toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalled();
    expect(document.body.classList.add).toHaveBeenCalledWith("ff-android-input-focus");
    act(() => {
      input.dispatchEvent(new FocusEvent("blur"));
    });
    expect(document.body.classList.remove).toHaveBeenCalledWith("ff-android-input-focus");
    // Clean up
    Object.defineProperty(window.navigator, "userAgent", { value: origUA, configurable: true });
    jest.useRealTimers();
  });

  it("handles mobile (non-Firefox) focus event", () => {
    jest.useFakeTimers();
    const origUA = window.navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true
    });
    
    const { TestComponent, inputRef, chatBoxRef } = setup();
    render(<TestComponent messages={[]} loading={false} />);
    
    const input = inputRef.current!;
    if (chatBoxRef.current) {
      setScrollProps(chatBoxRef.current, { scrollHeight: 1000, scrollTop: 0 });
    }
    
    input.scrollIntoView = jest.fn();
    window.scrollTo = jest.fn();
    
    act(() => {
      input.dispatchEvent(new FocusEvent("focus"));
      jest.advanceTimersByTime(120);
    });
    
    expect(input.scrollIntoView).toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalled();
    
    Object.defineProperty(window.navigator, "userAgent", { value: origUA, configurable: true });
    jest.useRealTimers();
  });

  it("handles scrollTo fallback when scrollTo with options throws", () => {
    jest.useFakeTimers();
    const { TestComponent, chatBoxRef } = setup();
    const { rerender } = render(<TestComponent messages={[]} loading={false} />);
    
    if (chatBoxRef.current) {
      setScrollProps(chatBoxRef.current, { scrollHeight: 500, scrollTop: 0 });
      // Mock scrollTo to throw error
      chatBoxRef.current.scrollTo = jest.fn(() => {
        throw new Error('scrollTo not supported');
      });
    }
    
    rerender(<TestComponent messages={[{ id: 1, text: "test" }]} loading={false} />);
    
    act(() => {
      jest.runAllTimers();
    });
    
    // Should fall back to setting scrollTop directly
    expect(chatBoxRef.current?.scrollTop).toBe(500);
    jest.useRealTimers();
  });

  it("handles null chatBoxRef gracefully", () => {
    jest.useFakeTimers();
    const TestComponent = () => {
      const chatBoxRef = React.useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
      const inputRef = React.useRef<HTMLInputElement>(null);
      useChatScrollAndFocus({
        chatBoxRef,
        inputRef,
        messages: [{ id: 1 }],
        loading: false,
      });
      return <input ref={inputRef} />;
    };
    
    // Should not throw even without chatBox element
    expect(() => {
      render(<TestComponent />);
      act(() => {
        jest.runAllTimers();
      });
    }).not.toThrow();
    
    jest.useRealTimers();
  });

  it("handles null inputRef gracefully", () => {
    const TestComponent = () => {
      const chatBoxRef = React.useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
      const inputRef = React.useRef<HTMLInputElement>(null);
      useChatScrollAndFocus({
        chatBoxRef,
        inputRef,
        messages: [],
        loading: false,
      });
      return <div ref={chatBoxRef} />;
    };
    
    // Should not throw even without input element
    expect(() => {
      render(<TestComponent />);
    }).not.toThrow();
  });
});

beforeAll(() => {
  jest.useFakeTimers();
});
afterAll(() => {
  jest.useRealTimers();
});

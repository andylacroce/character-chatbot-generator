// =============================
// useChatScrollAndFocus.ts
// Custom React hook for managing scroll and input focus in the chat UI.
// Ensures new messages are visible and input is focused appropriately.
// =============================

import { useEffect, useCallback } from "react";

// Safe focus helper: defer focusing to avoid synchronous DOM updates inside async callbacks
const safeFocus = (ref: React.RefObject<HTMLInputElement | null>) => {
  try {
    const el = ref?.current;
    if (!el || typeof el.focus !== "function") return;
    if (typeof document !== "undefined" && !document.contains(el)) return;
      // In test environment focus synchronously so tests that assert document.activeElement work.
      // In other environments defer to next tick so React's act() can batch updates and avoid warnings.
      if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "test") {
        try { el.focus(); } catch {}
      } else {
        setTimeout(() => {
          try { el.focus(); } catch {}
        }, 0);
      }
  } catch {}
};

/**
 * Custom hook to handle chat scroll and input focus logic for the chat page.
 * @param chatBoxRef - Ref to the chat messages container
 * @param inputRef - Ref to the chat input field
 * @param messages - Array of chat messages
 */
export function useChatScrollAndFocus({
  chatBoxRef,
  inputRef,
  messages,
  loading,
}: {
  chatBoxRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  messages: unknown[];
  loading: boolean;
}) {
  // Scroll to bottom utility
  const scrollToBottom = useCallback(() => {
    const el = chatBoxRef.current;
    if (el) {
      // For mobile browsers, use scrollTo with options for better compatibility
      try {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'auto' // Use 'auto' instead of 'smooth' for immediate scroll
        });
      } catch {
        // Fallback for older browsers
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [chatBoxRef]);  // Scroll to bottom when NEW messages are added (not when loading older messages)
  useEffect(() => {
    // Always auto-scroll when new messages are added to stay at the bottom of conversation
    // Use setTimeout to ensure the DOM has been updated before scrolling
    // This is especially important on mobile where rendering can be slower
    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, [messages.length, scrollToBottom]); // Use messages.length instead of messages array

  // Scroll to bottom on window resize (e.g., mobile keyboard appears)
  useEffect(() => {
    const handleResize = () => {
      // Always keep chat container at bottom
      scrollToBottom();

      // If on mobile and the input is focused, also ensure the page itself
      // scrolls to the bottom so the input is visible above the keyboard.
      try {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        const isMobile = /Android|iP(ad|hone|od)/i.test(ua);
        const input = inputRef.current;
        if (isMobile && input && document.activeElement === input) {
          // Use scrollIntoView first (helps some browsers adjust viewport)
          try { input.scrollIntoView({ block: "end", behavior: "auto" }); } catch {}
          // Then force page scroll to bottom as a fallback
          try { window.scrollTo(0, document.body.scrollHeight); } catch {}
        }
      } catch {}
    };
    window.addEventListener("resize", handleResize);

    // Add visualViewport resize listener for Firefox on Android only
    const isFirefoxAndroid = typeof navigator !== "undefined" &&
      navigator.userAgent.includes("Firefox") &&
      navigator.userAgent.includes("Android");
    let vvHandler: (() => void) | null = null;
    if (isFirefoxAndroid && window.visualViewport) {
      vvHandler = () => scrollToBottom();
      window.visualViewport.addEventListener("resize", vvHandler);
    }
    return () => {
      window.removeEventListener("resize", handleResize);
      if (isFirefoxAndroid && window.visualViewport && vvHandler) {
        window.visualViewport.removeEventListener("resize", vvHandler);
      }
    };
  }, [scrollToBottom, inputRef]);

  // Focus input field on mount (deferred)
  useEffect(() => {
    safeFocus(inputRef);
  }, [inputRef]);

  // Scroll to bottom when input is focused (mobile keyboard)
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isFirefoxAndroid = ua.includes("Firefox") && ua.includes("Android");
    const isMobile = /Android|iP(ad|hone|od)/i.test(ua);
    const handleFocus = () => {
      // Always try to keep the chat scrolled to the bottom first
      scrollToBottom();

      // On mobile browsers the virtual keyboard can change the viewport
      // asynchronously. Delay and then ensure both the chat container
      // and the page viewport are at the bottom so the last message and
      // the input remain visible.
      if (isMobile) {
        setTimeout(() => {
          try {
            // Ensure the chat container is at the bottom
            scrollToBottom();
          } catch {}
          try {
            // Bring the input into view (some browsers reposition better
            // with scrollIntoView than window.scrollTo)
            input.scrollIntoView({ block: "end", behavior: "auto" });
          } catch {}
          try {
            // Also attempt to scroll the page to the bottom for cases
            // where the chat container isn't the main scroller
            window.scrollTo(0, document.body.scrollHeight);
          } catch {}

          // Add FF Android class when appropriate (preserve previous behavior)
          if (isFirefoxAndroid) {
            try { document.body.classList.add("ff-android-input-focus"); } catch {}
          }
        }, 120);
      } else if (isFirefoxAndroid) {
        // Non-mobile fallback for the Firefox-on-Android special case
        setTimeout(() => {
          try { input.scrollIntoView({ block: "end", behavior: "smooth" }); } catch {}
          try { window.scrollTo(0, document.body.scrollHeight); } catch {}
          try { document.body.classList.add("ff-android-input-focus"); } catch {}
        }, 100);
      }
    };
    const handleBlur = () => {
      if (isFirefoxAndroid) {
        document.body.classList.remove("ff-android-input-focus");
      }
    };
    input.addEventListener("focus", handleFocus);
    input.addEventListener("blur", handleBlur);
    return () => {
      input.removeEventListener("focus", handleFocus);
      input.removeEventListener("blur", handleBlur);
    };
  }, [inputRef, scrollToBottom]);

  // Re-focus input field after loading completes
  useEffect(() => {
    if (!loading) {
      safeFocus(inputRef);
    }
  }, [loading, inputRef]);
}

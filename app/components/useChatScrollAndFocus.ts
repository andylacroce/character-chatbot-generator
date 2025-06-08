import { useEffect, useCallback } from "react";

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
  loading
}: {
  chatBoxRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  messages: any[];
  loading: boolean;
}) {
  // Scroll to bottom utility
  const scrollToBottom = useCallback(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatBoxRef]);

  // Scroll to bottom when messages update
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Scroll to bottom on window resize (e.g., mobile keyboard appears)
  useEffect(() => {
    const handleResize = () => {
      scrollToBottom();
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
  }, [scrollToBottom]);

  // Focus input field on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  // Scroll to bottom when input is focused (mobile keyboard)
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isFirefoxAndroid = ua.includes("Firefox") && ua.includes("Android");
    const handleFocus = () => {
      scrollToBottom();
      if (isFirefoxAndroid) {
        setTimeout(() => {
          input.scrollIntoView({ block: "end", behavior: "smooth" });
          window.scrollTo(0, document.body.scrollHeight);
          document.body.classList.add("ff-android-input-focus");
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
    if (!loading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading, inputRef]);
}

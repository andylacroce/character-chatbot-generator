import { useEffect } from "react";

/**
 * Adjusts CSS variables/classes so the chat layout leaves room for the on-screen keyboard on
 * mobile, using the `.ff-android-input-focus` pattern already defined in globals.css. Extracted
 * out of useChatController.ts — this effect is fully self-contained (only touches refs and the
 * DOM), with no dependency on chat/message/voice state.
 */
export function useMobileKeyboardViewportAdjustment(
  chatBoxRef: React.RefObject<HTMLDivElement | null>,
  inputRef: React.RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    const chatEl = chatBoxRef.current;
    if (!chatEl) return;

    const root = (typeof document !== "undefined" && document.documentElement) || null;
    const vv =
      typeof window !== "undefined" &&
      (window as Window & { visualViewport?: VisualViewport }).visualViewport;
    let lastPad = 0;

    // iOS heuristic: store an initial window.innerHeight to detect keyboard
    // by measuring the difference. This helps when visualViewport isn't
    // reliable on some iOS versions/browsers.
    let initialInnerHeight: number | null = null;
    const isIOS = typeof navigator !== "undefined" && /iP(ad|hone|od)/i.test(navigator.userAgent);

    const KEYBOARD_CLASSES = ["ff-android-input-focus", "mobile-keyboard-open"];
    const setCssPad = (pad: number) => {
      try {
        if (!root) return;
        // set CSS variable on :root so globals.css can consume it
        root.style.setProperty("--vv-keyboard-pad", `${pad}px`);
        if (pad > 0) {
          KEYBOARD_CLASSES.forEach((c) => root.classList.add(c));
        } else {
          KEYBOARD_CLASSES.forEach((c) => root.classList.remove(c));
        }
      } catch {}
    };

    let vvRaf: number | null = null;
    const scheduleViewportChange = () => {
      if (vvRaf !== null) return;
      vvRaf = window.requestAnimationFrame(() => {
        vvRaf = null;
        onViewportChange();
      });
    };

    const onViewportChange = () => {
      try {
        // Prefer visualViewport when available
        let heightDiff = 0;
        if (vv) {
          heightDiff = window.innerHeight - vv.height;
        } else if (isIOS) {
          // iOS: if we don't yet have an initialInnerHeight, set it now
          if (!initialInnerHeight) initialInnerHeight = window.innerHeight;
          heightDiff = initialInnerHeight - window.innerHeight;
        } else {
          // Fallback for other browsers without visualViewport
          heightDiff = 0;
        }

        const pad = heightDiff > 0 ? Math.min(heightDiff, 600) + 8 : 0;
        if (pad !== lastPad) {
          lastPad = pad;
          setCssPad(pad);
        }
      } catch {}
    };

    const onFocus = () => {
      // For iOS, capture initial height the first time the input is focused
      try {
        if (isIOS && !initialInnerHeight) initialInnerHeight = window.innerHeight;
      } catch {}

      // Delay slightly to let the visualViewport update
      setTimeout(() => {
        onViewportChange();
        try {
          chatEl.scrollTop = chatEl.scrollHeight;
        } catch {}
        // Also ensure the page itself is scrolled to the bottom on mobile
        try {
          const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
          if (/Android|iP(ad|hone|od)/i.test(ua)) {
            window.scrollTo(0, document.body.scrollHeight);
          }
        } catch {}
      }, 50);
    };

    const onBlur = () => {
      lastPad = 0;
      setCssPad(0);
    };

    if (vv) {
      vv.addEventListener("resize", scheduleViewportChange);
      vv.addEventListener("scroll", scheduleViewportChange);
    } else {
      window.addEventListener("resize", scheduleViewportChange);
    }

    const inputEl = inputRef.current;
    if (inputEl) {
      inputEl.addEventListener("focus", onFocus);
      inputEl.addEventListener("blur", onBlur);
    }

    return () => {
      try {
        if (vv) {
          vv.removeEventListener("resize", scheduleViewportChange);
          vv.removeEventListener("scroll", scheduleViewportChange);
        } else {
          window.removeEventListener("resize", scheduleViewportChange);
        }
        if (inputEl) {
          inputEl.removeEventListener("focus", onFocus);
          inputEl.removeEventListener("blur", onBlur);
        }
        // cleanup
        if (root) {
          KEYBOARD_CLASSES.forEach((c) => root.classList.remove(c));
          root.style.removeProperty("--vv-keyboard-pad");
        }
        if (vvRaf !== null) {
          window.cancelAnimationFrame(vvRaf);
          vvRaf = null;
        }
      } catch {}
    };
  }, [chatBoxRef, inputRef]);
}

import { useCallback, useEffect, useRef, useState } from "react";

export const INITIAL_VISIBLE_COUNT = 20;
const LOAD_MORE_COUNT = 10;

/**
 * Tracks how many of the most recent chat messages are rendered, growing the window as the
 * user scrolls to the top (RAF-throttled), and resets back to the initial count whenever the
 * active character (and thus its history key) changes. Extracted out of useChatController.ts.
 */
export function useChatVisiblePagination(
  chatBoxRef: React.RefObject<HTMLDivElement | null>,
  messagesLength: number,
  historyKey: string,
) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  const scrollRafRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (!chatBoxRef.current) return;
    // If we already have a pending RAF, skip scheduling another one
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!chatBoxRef.current) return;
      const { scrollTop } = chatBoxRef.current;
      if (scrollTop === 0 && visibleCount < messagesLength) {
        setVisibleCount((prev) => {
          const newCount = Math.min(prev + LOAD_MORE_COUNT, messagesLength);
          return newCount;
        });
      }
    });
  }, [chatBoxRef, visibleCount, messagesLength]);

  useEffect(() => {
    const ref = chatBoxRef.current;
    if (!ref) return;
    ref.addEventListener("scroll", handleScroll);
    return () => {
      ref.removeEventListener("scroll", handleScroll);
      // Cancel any pending RAF when cleaning up
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [chatBoxRef, handleScroll, visibleCount, messagesLength]);

  // Redundant with the bot-change reset in useChatController (historyKey derives from
  // bot.name) but kept as a direct safety net specifically for this key.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [historyKey]);

  return { visibleCount, setVisibleCount, handleScroll };
}

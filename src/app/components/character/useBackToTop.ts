import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drives the floating "To top" button. Put `topMarkerRef` on an element before the page
 * header; `showBackToTop` turns true after 360px of scrolling.
 */
export function useBackToTop() {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const topMarkerRef = useRef<HTMLDivElement>(null);

  // This app's flex-root layout makes BODY the scroll owner in Chromium, while
  // other engines may report window/documentElement/scrollingElement. Listen to
  // all of them and use the largest offset so visibility stays dynamic everywhere.
  useEffect(() => {
    const update = () => {
      const position = Math.max(
        window.scrollY,
        document.body.scrollTop,
        document.documentElement.scrollTop,
        document.scrollingElement?.scrollTop ?? 0,
      );
      setShowBackToTop(position > 360);
    };
    const targets: EventTarget[] = [window, document, document.body, document.documentElement];
    update();
    targets.forEach((target) => target.addEventListener("scroll", update, { passive: true }));
    return () => targets.forEach((target) => target.removeEventListener("scroll", update));
  }, []);

  const scrollToTop = useCallback(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    if (topMarkerRef.current) {
      topMarkerRef.current.scrollIntoView({ behavior, block: "start" });
      return;
    }
    document.scrollingElement?.scrollTo({ top: 0, behavior });
  }, []);

  return { showBackToTop, topMarkerRef, scrollToTop };
}

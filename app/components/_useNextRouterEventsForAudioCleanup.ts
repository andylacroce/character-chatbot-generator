import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Calls the provided stopAudio function on any route change (navigation away).
 * Ensures audio is always stopped when leaving the chat page, even via router links.
 */
export function useNextRouterEventsForAudioCleanup(stopAudio: () => void) {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      stopAudio();
    }
    prevPathRef.current = pathname;
  }, [pathname, stopAudio]);
}

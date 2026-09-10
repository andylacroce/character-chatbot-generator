import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import storage from "../../src/utils/storage";
import { STORAGE_KEYS } from "../../src/utils/storageKeys";

/** Test hook: override via setIsBrowserForTests to simulate SSR/browser. */
export let _isBrowser = () => typeof window !== "undefined";
/** Whether code is running in a browser (vs. SSR). */
export function isBrowser() {
  return _isBrowser();
}

/** Overrides the browser-detection function deterministically in tests. */
export function setIsBrowserForTests(fn: () => boolean) {
  _isBrowser = fn;
}
/** Restores the real browser-detection function after a test. */
export function resetIsBrowserForTests() {
  _isBrowser = () => typeof window !== "undefined";
}

/** Generates and returns `[sessionId, sessionDatetime]` for the current chat session. */
export function useSession(): [string, string] {
  const [sessionId, setSessionId] = useState("");
  const [sessionDatetime, setSessionDatetime] = useState("");

  // Generates a random uuid + timestamp, which must never run during SSR (would produce a
  // value that can't match the client's on hydration) — has to stay a post-mount effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let newSessionId = "";
    let sessionDatetime = "";
    if (isBrowser()) {
      newSessionId = uuidv4();
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      sessionDatetime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      // Persist session metadata to localStorage (durable per browser) if available
      try {
        storage.setItem(STORAGE_KEYS.sessionId, newSessionId);
        storage.setItem(STORAGE_KEYS.sessionDatetime, sessionDatetime);
      } catch {
        // ignore
      }
    }
    setSessionId(newSessionId);
    setSessionDatetime(sessionDatetime);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return [sessionId, sessionDatetime];
}

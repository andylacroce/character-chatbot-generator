// =============================
// useSession.ts
// Custom React hook for managing user session state (if applicable).
// Used for session persistence and user context in the app.
// =============================

import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import storage from '../../src/utils/storage';
import { STORAGE_KEYS } from '../../src/utils/storageKeys';

/**
 * Custom hook to manage session ID and session datetime for chat sessions.
 * Returns [sessionId, sessionDatetime].
 */
// Test hook: override in tests by replacing `_isBrowser` to simulate SSR/browser
export let _isBrowser = () => typeof window !== "undefined";
export function isBrowser() { return _isBrowser(); }

// Test helpers: allow tests to override the browser detection function deterministically
export function setIsBrowserForTests(fn: () => boolean) {
  _isBrowser = fn;
}
export function resetIsBrowserForTests() {
  _isBrowser = () => typeof window !== "undefined";
}

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

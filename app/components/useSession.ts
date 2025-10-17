// =============================
// useSession.ts
// Custom React hook for managing user session state (if applicable).
// Used for session persistence and user context in the app.
// =============================

import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import storage from '../../src/utils/storage';

/**
 * Custom hook to manage session ID and session datetime for chat sessions.
 * Returns [sessionId, sessionDatetime].
 */
export function useSession(): [string, string] {
  const [sessionId, setSessionId] = useState("");
  const [sessionDatetime, setSessionDatetime] = useState("");

  useEffect(() => {
    let newSessionId = "";
    let sessionDatetime = "";
    if (typeof window !== "undefined") {
      newSessionId = uuidv4();
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      sessionDatetime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      // Persist session metadata to localStorage (durable per browser) if available
      try {
        storage.setItem("bot-session-id", newSessionId);
        storage.setItem("bot-session-datetime", sessionDatetime);
      } catch {
        // ignore
      }
    }
    setSessionId(newSessionId);
    setSessionDatetime(sessionDatetime);
  }, []);

  return [sessionId, sessionDatetime];
}

import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

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
      sessionStorage.setItem("bot-session-id", newSessionId);
      sessionStorage.setItem("bot-session-datetime", sessionDatetime);
    }
    setSessionId(newSessionId);
    setSessionDatetime(sessionDatetime);
  }, []);

  return [sessionId, sessionDatetime];
}

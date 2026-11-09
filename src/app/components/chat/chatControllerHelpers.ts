import React, { useCallback } from "react";
import { authenticatedFetch } from "../../../utils/api";
import storage from "../../../utils/storage";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import type { Message } from "../../../types/message";
import { STORAGE_KEYS } from "character-chatbot-shared";

/**
 * The visitor's own preferred name (see useUserName.ts), read directly from localStorage
 * here rather than threaded through as a prop — a signed-in user's server-stored value
 * takes precedence server-side once set, so the client never needs to know which source
 * will actually apply.
 */
export function getStoredUserName(): string | undefined {
  return storage.getItem(STORAGE_KEYS.userName) || undefined;
}

/** Defers focusing an input to avoid synchronous DOM updates inside async callbacks. */
export const safeFocus = (ref: React.RefObject<HTMLInputElement | null>) => {
  try {
    const el = ref?.current;
    if (!el || typeof el.focus !== "function") return;
    if (typeof document !== "undefined" && !document.contains(el)) return;
    setTimeout(() => {
      try {
        el.focus();
      } catch {}
    }, 0);
  } catch {}
};

/** Runs `fn` and, outside production, logs how long it took under `label`. */
export const profileApiCall = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const end = performance.now();
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      logEvent("info", "chat_api_timing", `${label} completed`, {
        duration: Math.round(end - start),
        operation: label,
      });
    }
  }
};

/** Returns a best-effort logger that posts each chat message to `/api/log-message`. */
export function useLogMessage(sessionId: string, sessionDatetime: string) {
  return useCallback(
    async (message: Message) => {
      if (!sessionId || !sessionDatetime) return;
      try {
        await profileApiCall("Log Message", () =>
          authenticatedFetch("/api/log-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: message.sender,
              text: message.text,
              sessionId: sessionId,
              sessionDatetime: sessionDatetime,
            }),
          }).then((res) => {
            if (!res.ok) throw new Error("Log failed");
          }),
        );
      } catch (error) {
        if (typeof window !== "undefined") {
          logEvent(
            "warn",
            "client_log_message_failed",
            "Failed to log message to server",
            sanitizeLogMeta({
              error: error instanceof Error ? error.message : String(error),
              sender: message.sender,
              sessionId,
            }),
          );
        }
      }
    },
    [sessionId, sessionDatetime],
  );
}

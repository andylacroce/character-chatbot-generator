import { useEffect, useRef } from "react";
import storage from "../../utils/storage";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import type { Message } from "../../types/message";
import { lastPlayedAudioHashKey } from "character-chatbot-shared";

/** Cheap content hash used to detect whether the latest message actually changed. */
function getMessageHash(msg: Message) {
  return `${msg.sender}__${msg.text}__${msg.audioFileUrl ?? ""}`;
}

/**
 * Plays the latest bot message's audio exactly once (tracked via a per-character localStorage
 * hash, so a re-render or remount doesn't replay it), and stops on unmount/message change.
 * Extracted out of useChatController.ts.
 */
export function useAutoPlayLatestMessage(
  messages: Message[],
  botName: string,
  playAudio: (url: string, signal?: AbortSignal) => Promise<HTMLAudioElement>,
  stopAudio: () => void,
) {
  const lastPlayedAudioHashRef = useRef<string | null>(null);

  // Reset the in-memory "already played" marker when the active character changes, so a
  // stale hash from the previous character can't suppress the new character's own intro
  // audio. localStorage itself is already keyed per-character (lastPlayedAudioHashKey), but
  // this ref is only lazily read from storage once, so it must be cleared explicitly here.
  useEffect(() => {
    lastPlayedAudioHashRef.current = null;
  }, [botName]);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    const lastMsgHash = getMessageHash(lastMsg);
    if (typeof window !== "undefined") {
      // Lazy-init cache: only read localStorage once per mount, then rely on this
      // same ref for every later run of this effect — deliberate read-then-write.
      if (lastPlayedAudioHashRef.current === null) {
        try {
          lastPlayedAudioHashRef.current = storage.getItem(lastPlayedAudioHashKey(botName));
        } catch {}
      }
    }
    if (
      lastMsg.sender === botName &&
      typeof lastMsg.audioFileUrl === "string" &&
      lastMsgHash !== lastPlayedAudioHashRef.current
    ) {
      (async () => {
        if (!cancelled) {
          // Mark this message as being played to avoid concurrent double-play
          lastPlayedAudioHashRef.current = lastMsgHash;
          try {
            await playAudio(lastMsg.audioFileUrl!, abortController.signal);
            try {
              storage.setItem(lastPlayedAudioHashKey(botName), lastMsgHash);
            } catch {}
          } catch (err: unknown) {
            // If playback failed or was aborted, clear the in-progress marker
            const errName =
              err && typeof err === "object" && "name" in err
                ? ((err as Record<string, unknown>)["name"] as string | undefined)
                : undefined;
            if (errName === "AbortError") {
              // aborted - do not log as error
              if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
                logEvent("info", "chat_audio_playback_aborted", "Audio playback aborted", {
                  botName,
                });
              }
            } else {
              if (typeof window !== "undefined") {
                logEvent(
                  "error",
                  "chat_audio_playback_error",
                  "Audio playback failed",
                  sanitizeLogMeta({
                    botName,
                    error: err instanceof Error ? err.message : String(err),
                    errorName: errName,
                  }),
                );
              }
            }
            if (lastPlayedAudioHashRef.current === lastMsgHash) {
              lastPlayedAudioHashRef.current = null;
            }
          }
        }
      })();
    }
    return () => {
      cancelled = true;
      abortController.abort();
      stopAudio();
    };
  }, [messages, botName, playAudio, stopAudio]);
}

import { useState, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { authenticatedFetch } from "../../../utils/api";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import type { Message } from "../../../types/message";
import type { Bot } from "../character/BotCreator";
import type { CharacterVoiceConfig } from "../../../utils/chat/characterVoices";
import { INTRO_PROMPT, buildChatRequest, chatReplyMessage } from "character-chatbot-shared";
import { getStoredUserName, profileApiCall } from "./chatControllerHelpers";

interface UseChatIntroOptions {
  bot: Bot;
  messageCount: number;
  apiAvailable: boolean;
  /** False until a signed-in user's server history has been checked (see useServerHistoryReconcile). */
  historyReconciled: boolean;
  ensureVoiceConfig: () => Promise<CharacterVoiceConfig | null>;
  logMessage: (message: Message) => Promise<void>;
  setError: (message: string) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
}

/**
 * Generates the character's opening message when a chat starts empty. Owns the intro's
 * loading/error state and its "ran once" guards, and clears them when the visitor switches
 * characters.
 */
export function useChatIntro({
  bot,
  messageCount,
  apiAvailable,
  historyReconciled,
  ensureVoiceConfig,
  logMessage,
  setError,
  setMessages,
}: UseChatIntroOptions) {
  const [introLoading, setIntroLoading] = useState<boolean>(false);
  const [introError, setIntroError] = useState<string | null>(null);
  const introSentRef = useRef(false);
  const introRequestInProgressRef = useRef(false);

  // Switching characters clears the intro state so the new one gets its own introduction.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    introSentRef.current = false;
    setIntroError(null);
    setIntroLoading(false);
  }, [bot.name]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    // Prevent multiple concurrent requests (React Strict Mode protection)
    if (introSentRef.current || introRequestInProgressRef.current) return;
    // Wait until we know whether this (possibly signed-in, server-saved) character
    // already has real history — see useServerHistoryReconcile.
    if (!historyReconciled) return;
    if (messageCount === 0 && apiAvailable) {
      // introSentRef is a deliberate "ran once" guard against React Strict Mode's
      // double-invoke — reading then writing it within the same effect is exactly
      // the point (a real duplicate-intro-message bug was fixed this way). Setting
      // introLoading synchronously here (not in a callback) is what actually shows
      // the loading state before the async fetch below starts.
      /* eslint-disable react-hooks/set-state-in-effect */
      introSentRef.current = true;
      introRequestInProgressRef.current = true;
      setIntroLoading(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      let cancelled = false;
      const getIntro = async () => {
        try {
          const voiceConfig = await ensureVoiceConfig();
          if (cancelled) return;
          if (!voiceConfig) {
            const msg = "Voice configuration missing for this character. Please recreate the bot.";
            if (!cancelled) {
              setIntroError(msg);
              setError(msg);
              setIntroLoading(false);
            }
            if (typeof window !== "undefined") {
              logEvent(
                "error",
                "chat_intro_voice_config_missing",
                msg,
                sanitizeLogMeta({
                  botName: bot.name,
                  hasVoiceConfig: !!bot.voiceConfig,
                }),
              );
            }
            return;
          }
          const response = await profileApiCall("Fetch Intro", () =>
            authenticatedFetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              // isIntro tells the server this internal prompt isn't a real "User" turn to persist.
              body: JSON.stringify(
                buildChatRequest({
                  bot,
                  voiceConfig,
                  message: INTRO_PROMPT,
                  userName: getStoredUserName(),
                  isIntro: true,
                }),
              ),
            }).then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            }),
          );
          if (cancelled) return;
          const introMsg: Message = chatReplyMessage(bot.name, response);
          setMessages([introMsg]);
          logMessage(introMsg);
          setIntroError(null);
          setIntroLoading(false);
        } catch (e) {
          if (cancelled) return;
          const msg = "Failed to generate intro or voice config. Please recreate the bot.";
          setIntroError(msg);
          setError(msg);
          setIntroLoading(false);
          if (typeof window !== "undefined") {
            logEvent(
              "error",
              "chat_intro_generation_failed",
              msg,
              sanitizeLogMeta({
                botName: bot.name,
                error: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        } finally {
          if (!cancelled) {
            introRequestInProgressRef.current = false;
          }
        }
      };
      getIntro();
      return () => {
        cancelled = true;
        introSentRef.current = false;
        introRequestInProgressRef.current = false;
      };
    }
  }, [
    messageCount,
    apiAvailable,
    bot,
    logMessage,
    setError,
    ensureVoiceConfig,
    historyReconciled,
    setMessages,
  ]);

  return { introLoading, introError };
}

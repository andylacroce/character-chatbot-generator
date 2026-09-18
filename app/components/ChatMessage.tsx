/**
 * Component for rendering individual chat messages in the conversation.
 * @module ChatMessage
 */

import React from "react";
import styles from "./styles/ChatMessage.module.css";
import Image from "next/image";
import { Bot } from "./BotCreator";
import { sanitizeForReact } from "../../src/utils/security";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { FaRedoAlt } from "react-icons/fa";

/**
 * Interface representing a chat message's structure.
 * @interface Message
 * @property {string} text - The content of the message.
 * @property {string} sender - The sender of the message ('User' or 'AI').
 */
export interface Message {
  text: string;
  sender: string;
  audioFileUrl?: string;
}

interface ChatMessageProps {
  message: Message;
  bot: Bot;
  // Opens the shared portrait lightbox (owned by ChatPage) — same modal the
  // header's avatar opens, so there's one modal instance, not one per message.
  onAvatarClick?: () => void;
  /** Replays this character response through the shared chat audio player. */
  onReplayAudio?: (message: Message) => void;
  /** Keeps replay visible but unavailable while the global audio preference is muted. */
  replayDisabled?: boolean;
  // The visitor's own preferred name (see useUserName.ts) — shown on their own
  // messages instead of the generic "Me" when set. Passed down from ChatPage's single
  // useUserName() instance, so every message re-renders live if the name changes
  // mid-session, not just new ones going forward.
  userName?: string;
}

/**
 * ChatMessage component that displays a single message in the chat interface.
 * This component handles the styling and formatting of messages based on the sender.
 *
 * @function
 * @param {object} props - The component props
 * @param {Message} props.message - The message object containing text and sender information
 * @param {Bot} props.bot - The bot object containing name and avatarUrl for assistant messages
 * @returns {JSX.Element|null} The rendered chat message or null if message is invalid
 */
const ChatMessage = React.memo(
  ({
    message,
    bot,
    onAvatarClick,
    onReplayAudio,
    replayDisabled = false,
    userName,
  }: ChatMessageProps) => {
    // Validate message object to prevent rendering errors
    if (!message || typeof message.text !== "string" || typeof message.sender !== "string") {
      if (typeof window !== "undefined") {
        logEvent(
          "error",
          "chat_message_invalid",
          "Invalid message object received",
          sanitizeLogMeta({
            hasSender: !!(message && typeof message.sender === "string"),
            hasText: !!(message && typeof message.text === "string"),
            messageType: typeof message,
          }),
        );
      }
      return null; // Render nothing if the message is invalid
    }

    // Determine CSS classes based on message sender
    const isUser = message.sender === "User";
    const messageClass = isUser ? styles.userMessage : styles.botMessage;
    const senderClass = isUser ? styles.sender : `${styles.sender} ${styles.botSender}`;

    return (
      <div
        className={`${styles.message} ${messageClass}`}
        role="article"
        aria-label={
          isUser
            ? `Message from you: ${sanitizeForReact(message.text)}`
            : `Message from ${bot.name}: ${sanitizeForReact(message.text)}`
        }
      >
        <div className={styles.byline}>
          {!isUser && (
            <button
              type="button"
              aria-label={`View ${bot.name}'s portrait`}
              className={styles.avatarButton}
              onClick={onAvatarClick}
            >
              <Image
                src={bot.avatarUrl}
                alt={bot.name}
                width={28}
                height={28}
                className={styles.avatar}
              />
            </button>
          )}
          <span className={senderClass}>{isUser ? userName || "Me" : bot.name}</span>
          {!isUser && onReplayAudio && (
            <button
              type="button"
              className={styles.replayButton}
              onClick={() => onReplayAudio(message)}
              disabled={replayDisabled}
              aria-label={`Replay audio for ${message.sender}'s message`}
              title={replayDisabled ? "Turn audio on to replay this message" : "Replay audio"}
            >
              <FaRedoAlt aria-hidden="true" focusable="false" />
            </button>
          )}
        </div>
        <div className={styles.messageText}>{sanitizeForReact(message.text)}</div>
      </div>
    );
  },
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;

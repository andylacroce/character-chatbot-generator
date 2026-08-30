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
}

/**
 * ChatMessage component that displays a single message in the chat interface.
 * This component handles the styling and formatting of messages based on the sender.
 *
 * @function
 * @param {Object} props - The component props
 * @param {Message} props.message - The message object containing text and sender information
 * @param {Bot} props.bot - The bot object containing name and avatarUrl for assistant messages
 * @returns {JSX.Element|null} The rendered chat message or null if message is invalid
 */
const ChatMessage = React.memo(
  ({ message, bot, onAvatarClick }: ChatMessageProps) => {
    // Validate message object to prevent rendering errors
    if (!message || typeof message.text !== "string" || typeof message.sender !== "string") {
      if (typeof window !== 'undefined') {
        logEvent('error', 'chat_message_invalid', 'Invalid message object received', sanitizeLogMeta({
          hasSender: !!(message && typeof message.sender === 'string'),
          hasText: !!(message && typeof message.text === 'string'),
          messageType: typeof message
        }));
      }
      return null; // Render nothing if the message is invalid
    }

    // Determine CSS classes based on message sender
    const isUser = message.sender === "User";
    const messageClass = isUser ? styles.userMessage : styles.botMessage;
    const senderClass = isUser
      ? styles.sender
      : `${styles.sender} ${styles.botSender}`;

    return (
      <div
        className={`${styles.message} ${messageClass}`}
        role="article"
        aria-label={isUser ? `Message from you: ${sanitizeForReact(message.text)}` : `Message from ${bot.name}: ${sanitizeForReact(message.text)}`}
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
                style={{ objectFit: 'cover' }}
              />
            </button>
          )}
          <span className={senderClass}>{isUser ? "Me" : bot.name}</span>
        </div>
        <div className={styles.messageText}>
          {sanitizeForReact(message.text)}
        </div>
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;

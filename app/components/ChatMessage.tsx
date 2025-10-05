/**
 * Component for rendering individual chat messages in the conversation.
 * @module ChatMessage
 */

import React from "react";
import styles from "./styles/ChatMessage.module.css";
import Image from "next/image";
import { Bot } from "./BotCreator";
import { sanitizeForDisplay } from "../../src/utils/security";

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
  ({ message, bot }: ChatMessageProps) => {
    // Validate message object to prevent rendering errors
    if (!message || typeof message.text !== "string" || typeof message.sender !== "string") {
      console.error("Invalid message object", message);
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
        className={`${styles.message} ${messageClass} my-2`}
        role="article"
        aria-label={isUser ? `Message from you: ${message.text}` : `Message from ${bot.name}: ${message.text}`}
      >
        <div className="rounded p-2 text-sm" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {!isUser && (
            <Image
              src={bot.avatarUrl}
              alt={bot.name}
              width={40}
              height={40}
              className="rounded-circle"
              style={{ objectFit: 'cover', marginRight: 8 }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div className={`mb-1 ${senderClass} text-left`} style={{ fontSize: '1.4rem' }}>
              {isUser ? "Me" : bot.name}
            </div>
            <div className="text-left" style={{ fontSize: 'var(--chat-message-font-size)' }}>
              {sanitizeForDisplay(message.text)}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;

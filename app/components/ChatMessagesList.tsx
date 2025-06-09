import React from "react";
import ChatMessage from "./ChatMessage";
import { Bot } from "./BotCreator";

interface ChatMessagesListProps {
  messages: Array<{
    text: string;
    sender: string;
    audioFileUrl?: string;
  }>;
  bot: Bot;
  className?: string;
}

const ChatMessagesList: React.FC<ChatMessagesListProps> = ({ messages, bot, className }) => (
  <div
    className={className}
    data-testid="chat-messages-container"
    style={{ paddingTop: 20 }}
    role="log"
    aria-live="polite"
    aria-relevant="additions text"
  >
    {messages.map((msg, index) => (
      <ChatMessage key={index} message={msg} bot={bot} />
    ))}
  </div>
);

export default ChatMessagesList;

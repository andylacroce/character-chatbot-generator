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
}

const ChatMessagesList: React.FC<ChatMessagesListProps> = ({ messages, bot }) => (
  <>
    {/* Flex spacer to push messages to bottom when there's not enough content to fill container */}
    <div style={{ flexGrow: 1 }} />
    {messages.map((msg, index) => (
      <ChatMessage key={index} message={msg} bot={bot} />
    ))}
  </>
);

export default ChatMessagesList;

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
    {messages.map((msg, index) => (
      <ChatMessage key={index} message={msg} bot={bot} />
    ))}
  </>
);

export default ChatMessagesList;

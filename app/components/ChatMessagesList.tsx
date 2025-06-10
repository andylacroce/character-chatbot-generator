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
  showSkeletons?: boolean;
}

const SKELETON_COUNT = 3;

const ChatMessagesList: React.FC<ChatMessagesListProps> = React.memo(({ messages, bot, showSkeletons }) => (
  <>
    {/* Flex spacer to push messages to bottom when there's not enough content to fill container */}
    <div style={{ flexGrow: 1 }} />
    {showSkeletons
      ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <ChatMessage key={`skeleton-${i}`} message={{ text: '', sender: i % 2 === 0 ? 'User' : bot.name }} bot={bot} skeleton />
        ))
      : messages.map((msg, index) => (
          <ChatMessage key={index} message={msg} bot={bot} />
        ))}
  </>
));

export default ChatMessagesList;

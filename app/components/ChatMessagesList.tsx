/**
 * ChatMessagesList component
 *
 * Renders a list of chat messages, using react-window for virtualization if the list is long.
 * Displays skeletons while loading, and always anchors the most recent messages at the bottom.
 *
 * @param {ChatMessagesListProps} props - The component props
 * @returns {JSX.Element} The rendered list of chat messages
 */

import React from "react";
import ChatMessage from "./ChatMessage";
import { Bot } from "./BotCreator";
import VirtualizedMessagesList from "./VirtualizedMessagesList";

interface ChatMessagesListProps {
  messages: Array<{
    text: string;
    sender: string;
    audioFileUrl?: string;
  }>;
  bot: Bot;
}

const VIRTUALIZE_THRESHOLD = 30;


const ChatMessagesList: React.FC<ChatMessagesListProps> = React.memo(({ messages, bot }) => {
  if (messages.length < VIRTUALIZE_THRESHOLD) {
    return (
      <>
        <div style={{ flexGrow: 1 }} />
        {messages.map((msg, index) => (
          <ChatMessage key={index} message={msg} bot={bot} />
        ))}
      </>
    );
  }
  return <VirtualizedMessagesList messages={messages} bot={bot} />;
});

ChatMessagesList.displayName = "ChatMessagesList";

export default ChatMessagesList;

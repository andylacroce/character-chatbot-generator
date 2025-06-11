/**
 * ChatMessagesList component
 *
 * Renders a list of chat messages, using react-window for virtualization if the list is long.
 * Displays skeletons while loading, and always anchors the most recent messages at the bottom.
 *
 * @param {ChatMessagesListProps} props - The component props
 * @returns {JSX.Element} The rendered list of chat messages
 */

import React, { useRef, useEffect, useState } from "react";
import ChatMessage from "./ChatMessage";
import { Bot } from "./BotCreator";
import { FixedSizeList as List } from "react-window";

interface ChatMessagesListProps {
  messages: Array<{
    text: string;
    sender: string;
    audioFileUrl?: string;
  }>;
  bot: Bot;
  showSkeletons?: boolean;
}

const DEFAULT_ITEM_SIZE = 80; // px, matches itemSize below
const VIRTUALIZE_THRESHOLD = 30;

const ChatMessagesList: React.FC<ChatMessagesListProps> = React.memo(({ messages, bot, showSkeletons }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [skeletonCount, setSkeletonCount] = useState(3);

  useEffect(() => {
    if (!showSkeletons) return;
    const updateSkeletonCount = () => {
      if (containerRef.current) {
        const height = containerRef.current.clientHeight || 480;
        setSkeletonCount(Math.max(1, Math.ceil(height / DEFAULT_ITEM_SIZE)));
      }
    };
    updateSkeletonCount();
    window.addEventListener('resize', updateSkeletonCount);
    return () => window.removeEventListener('resize', updateSkeletonCount);
  }, [showSkeletons]);

  if (showSkeletons) {
    return (
      <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', minHeight: 0 }}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ChatMessage key={`skeleton-${i}`} message={{ text: '', sender: i % 2 === 0 ? 'User' : bot.name }} bot={bot} skeleton />
        ))}
      </div>
    );
  }

  // Only virtualize if there are many messages
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

  // Virtualized list for long chats, anchored to bottom
  const itemCount = messages.length;
  const itemSize = 80; // px, adjust for your message height
  const height = Math.min(480, itemCount * itemSize + 1); // max 6 messages visible

  // Always show the most recent messages at the bottom
  const startIdx = Math.max(0, itemCount - Math.floor(height / itemSize));
  const visibleMessages = messages.slice(startIdx);

  // Use the correct type for Row props
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <ChatMessage key={index + startIdx} message={visibleMessages[index]} bot={bot} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', minHeight: 0 }}>
      <List
        height={height}
        itemCount={visibleMessages.length}
        itemSize={itemSize}
        width={"100%"}
        overscanCount={4}
        style={{ flex: 1 }}
      >
        {Row}
      </List>
    </div>
  );
});

ChatMessagesList.displayName = "ChatMessagesList";

export default ChatMessagesList;

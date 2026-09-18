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
import styles from "./styles/ChatMessagesList.module.css";

interface ChatMessagesListProps {
  messages: Array<{
    text: string;
    sender: string;
    audioFileUrl?: string;
  }>;
  bot: Bot;
  onAvatarClick?: () => void;
  onReplayAudio?: (message: ChatMessagesListProps["messages"][number]) => void;
  replayDisabled?: boolean;
  /** The visitor's own preferred name — see ChatMessage.tsx. */
  userName?: string;
}

const VIRTUALIZE_THRESHOLD = 30;

const ChatMessagesList: React.FC<ChatMessagesListProps> = React.memo(
  ({ messages, bot, onAvatarClick, onReplayAudio, replayDisabled, userName }) => {
    if (messages.length < VIRTUALIZE_THRESHOLD) {
      return (
        <>
          <div className={styles.spacer} />
          {messages.map((msg, index) => (
            <ChatMessage
              key={index}
              message={msg}
              bot={bot}
              onAvatarClick={onAvatarClick}
              onReplayAudio={onReplayAudio}
              replayDisabled={replayDisabled}
              userName={userName}
            />
          ))}
        </>
      );
    }
    return (
      <VirtualizedMessagesList
        messages={messages}
        bot={bot}
        onAvatarClick={onAvatarClick}
        onReplayAudio={onReplayAudio}
        replayDisabled={replayDisabled}
        userName={userName}
      />
    );
  },
);

ChatMessagesList.displayName = "ChatMessagesList";

export default ChatMessagesList;

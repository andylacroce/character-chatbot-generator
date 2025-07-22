import React from "react";
import { FixedSizeList as List } from "react-window";
import ChatMessage from "./ChatMessage";
import { Bot } from "./BotCreator";

interface VirtualizedMessagesListProps {
    messages: Array<{
        text: string;
        sender: string;
        audioFileUrl?: string;
    }>;
    bot: Bot;
    itemSize?: number;
    maxHeight?: number;
}

const VirtualizedMessagesList: React.FC<VirtualizedMessagesListProps> = ({ messages, bot, itemSize = 80, maxHeight = 480 }) => {
    const itemCount = messages.length;
    const height = Math.min(maxHeight, itemCount * itemSize + 1);
    const startIdx = Math.max(0, itemCount - Math.floor(height / itemSize));
    const visibleMessages = messages.slice(startIdx);

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
};

export default VirtualizedMessagesList;

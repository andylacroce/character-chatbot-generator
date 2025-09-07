import React from "react";
import { List as RWList } from "react-window";
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

    // Row component used by react-window's List API. The library's current
    // List implementation expects a `rowComponent` and `rowProps` instead of
    // the old FixedSizeList children render-prop API.
    interface RowProps {
        index: number;
        style: React.CSSProperties;
        // Some test/mocked variants of react-window don't pass `rowProps`.
        // We'll read from the outer closure (visibleMessages, bot) which is
        // always available in this component.
        rowProps?: unknown;
    }

    const Row: React.FC<RowProps> = ({ index, style }) => (
        <div style={style}>
            <ChatMessage key={index + startIdx} message={visibleMessages[index]} bot={bot} />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', minHeight: 0 }}>
            <RWList
                height={height}
                rowCount={visibleMessages.length}
                rowHeight={itemSize}
                width={"100%"}
                overscanCount={4}
                rowComponent={Row}
                rowProps={{ visibleMessages, bot }}
                style={{ flex: 1 }}
            />
        </div>
    );
};

export default VirtualizedMessagesList;

import React from "react";
import { List as RWList } from "react-window";
import ChatMessage from "./ChatMessage";
import { Bot } from "./BotCreator";

type VisibleMessage = { text: string; sender: string; audioFileUrl?: string };

interface VirtualizedMessagesListProps {
    messages: VisibleMessage[];
    bot: Bot;
    onAvatarClick?: () => void;
    maxHeight?: number;
}

// Message rows are variable height in the "immersive stage" layout — bot replies
// render as large serif pull-quotes, user replies stay small — so a single fixed
// row height (the old itemSize) would clip or overlap rows once virtualization
// kicks in on long conversations. This is a lightweight character-count estimate
// (no DOM measurement, so no ResizeObserver wiring needed); it only has to be
// generous enough to avoid overlap, not pixel-perfect, since react-window uses it
// purely for row placement.
const BOT_CHARS_PER_LINE = 42;
const USER_CHARS_PER_LINE = 55;
const BOT_LINE_HEIGHT = 34;
const USER_LINE_HEIGHT = 26;
const ROW_CHROME = 60; // sender byline + vertical padding + divider

function estimateRowHeight(message: VisibleMessage | undefined): number {
    if (!message) return ROW_CHROME + BOT_LINE_HEIGHT;
    const isBot = message.sender !== "User";
    const charsPerLine = isBot ? BOT_CHARS_PER_LINE : USER_CHARS_PER_LINE;
    const lineHeight = isBot ? BOT_LINE_HEIGHT : USER_LINE_HEIGHT;
    const lines = Math.max(1, Math.ceil(message.text.length / charsPerLine));
    return ROW_CHROME + lines * lineHeight;
}

const VirtualizedMessagesList: React.FC<VirtualizedMessagesListProps> = ({ messages, bot, onAvatarClick, maxHeight = 480 }) => {
    const itemCount = messages.length;
    const heights = React.useMemo(() => messages.map(estimateRowHeight), [messages]);

    // Trim from the front until the estimated total fits within maxHeight, so the
    // virtualized window still anchors on the most recent messages, same as the
    // non-virtualized path in ChatMessagesList.
    const { startIdx, visibleHeights } = React.useMemo(() => {
        let start = 0;
        let running = heights.reduce((sum, h) => sum + h, 0);
        while (start < itemCount - 1 && running > maxHeight) {
            running -= heights[start];
            start += 1;
        }
        return { startIdx: start, visibleHeights: heights.slice(start) };
    }, [heights, itemCount, maxHeight]);

    const visibleMessages = messages.slice(startIdx);
    const height = Math.min(maxHeight, visibleHeights.reduce((sum, h) => sum + h, 0) + 1);

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
            <ChatMessage key={index + startIdx} message={visibleMessages[index]} bot={bot} onAvatarClick={onAvatarClick} />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', minHeight: 0 }}>
            <RWList
                height={height}
                rowCount={visibleMessages.length}
                rowHeight={(index: number) => visibleHeights[index] ?? ROW_CHROME}
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

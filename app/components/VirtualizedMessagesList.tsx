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

interface RowProps {
    visibleMessages: VisibleMessage[];
    bot: Bot;
    onAvatarClick?: () => void;
}

// Module-scope (not defined inside VirtualizedMessagesList) so react-window isn't handed a
// brand-new component reference on every render — all the data it needs travels through
// `rowProps`, matching react-window v2's actual rowComponent contract, rather than a
// closure over the parent's render.
//
// react-window ships its own types (RowComponentProps), but this repo has a blanket
// `declare module 'react-window'` shim (declarations/react-window.d.ts) working around a
// TS inference gap in List's generic signature under this project's moduleResolution —
// see that file's comment. That makes every named export `any`, so the row props shape is
// typed by hand here instead of importing RowComponentProps.
function Row({ index, style, visibleMessages, bot, onAvatarClick }: RowProps & { index: number; style: React.CSSProperties }) {
    return (
        <div style={style}>
            <ChatMessage message={visibleMessages[index]} bot={bot} onAvatarClick={onAvatarClick} />
        </div>
    );
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', minHeight: 0 }}>
            <RWList
                height={height}
                rowCount={visibleMessages.length}
                rowHeight={(index: number) => visibleHeights[index] ?? ROW_CHROME}
                width={"100%"}
                overscanCount={4}
                rowComponent={Row}
                rowProps={{ visibleMessages, bot, onAvatarClick }}
                style={{ flex: 1 }}
            />
        </div>
    );
};

export default VirtualizedMessagesList;

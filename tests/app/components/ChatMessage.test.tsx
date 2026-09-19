import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ChatMessage, { Message } from "../../../app/components/ChatMessage";
import { logEvent } from "../../../src/utils/logger";

// Mock the logger
jest.mock("../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: jest.fn((meta) => meta),
}));

const mockBot = {
  name: "Gandalf",
  personality: "Wise wizard",
  avatarUrl: "/gandalf.png",
  voiceConfig: null,
};

describe("ChatMessage", () => {
  it("renders user message correctly", () => {
    const message: Message = { text: "Hello!", sender: "User" };
    render(<ChatMessage message={message} bot={mockBot} />);
    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.getByText("Hello!")).toBeInTheDocument();
    expect(screen.queryByAltText("Gandalf")).not.toBeInTheDocument();
  });

  it("renders bot message with avatar", () => {
    const message: Message = { text: "You shall not pass!", sender: "Gandalf" };
    render(<ChatMessage message={message} bot={mockBot} />);
    expect(screen.getByText("Gandalf")).toBeInTheDocument();
    expect(screen.getByText("You shall not pass!")).toBeInTheDocument();
    expect(screen.getByAltText("Gandalf")).toBeInTheDocument();
  });

  it("shows the message's own sender/avatar, not the current bot prop's, when they differ", () => {
    // Regression test: the guessing game's chat partner changes mid-transcript (the
    // `bot` prop always reflects whoever is CURRENT), while a message's own `sender`/
    // `avatarUrl` reflect who actually said it. A prior bug displayed every message with
    // the live `bot` prop's name/avatar, silently relabeling past rounds to whoever the
    // partner became after a round switch (e.g. an old Jim Hawkins line rendering as
    // "Electra"). Every message must show its own attribution instead.
    const message: Message = {
      text: "I've got a curious mind on my hands today.",
      sender: "Jim Hawkins",
      avatarUrl: "/jim-hawkins.png",
    };
    render(<ChatMessage message={message} bot={mockBot} />);
    expect(screen.getByText("Jim Hawkins")).toBeInTheDocument();
    expect(screen.queryByText("Gandalf")).not.toBeInTheDocument();
    expect(screen.getByAltText("Jim Hawkins")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent("/jim-hawkins.png")),
    );
  });

  it("falls back to the current bot's avatar when a message has none of its own", () => {
    // Covers ordinary chat (never sets avatarUrl per message) and any pre-fix persisted
    // game message from localStorage that predates this field.
    const message: Message = { text: "You shall not pass!", sender: "Gandalf" };
    render(<ChatMessage message={message} bot={mockBot} />);
    expect(screen.getByAltText("Gandalf")).toHaveAttribute(
      "src",
      expect.stringContaining(encodeURIComponent("/gandalf.png")),
    );
  });

  it("replays a bot message from its byline control", () => {
    const onReplayAudio = jest.fn();
    const message: Message = {
      text: "You shall not pass!",
      sender: "Gandalf",
      audioFileUrl: "/api/audio?file=gandalf.mp3",
    };
    render(<ChatMessage message={message} bot={mockBot} onReplayAudio={onReplayAudio} />);

    fireEvent.click(screen.getByRole("button", { name: "Replay audio for Gandalf's message" }));

    expect(onReplayAudio).toHaveBeenCalledWith(message);
  });

  it("does not show replay on user messages", () => {
    render(
      <ChatMessage
        message={{ text: "Hello!", sender: "User" }}
        bot={mockBot}
        onReplayAudio={jest.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Replay audio/ })).not.toBeInTheDocument();
  });

  it("keeps replay visible but disabled while audio is muted", () => {
    render(
      <ChatMessage
        message={{ text: "A quiet reply", sender: "Gandalf" }}
        bot={mockBot}
        onReplayAudio={jest.fn()}
        replayDisabled
      />,
    );

    expect(
      screen.getByRole("button", { name: "Replay audio for Gandalf's message" }),
    ).toBeDisabled();
  });

  it("returns null and logs error for invalid message", () => {
    // @ts-expect-error purposely invalid
    const { container } = render(<ChatMessage message={null} bot={mockBot} />);
    expect(container.firstChild).toBeNull();
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "chat_message_invalid",
      "Invalid message object received",
      expect.any(Object),
    );
  });

  it("handles missing optional audioFileUrl", () => {
    const message: Message = { text: "No audio", sender: "User" };
    render(<ChatMessage message={message} bot={mockBot} />);
    expect(screen.getByText("No audio")).toBeInTheDocument();
  });

  it("returns null for message with non-string text (truthy message, logs with hasSender=true)", () => {
    // message is truthy (object), but .text is not a string — exercises the binary-expr where message is truthy
    const { container } = render(
      // @ts-expect-error purposely invalid type for text
      <ChatMessage message={{ text: 123, sender: "User" }} bot={mockBot} />,
    );
    expect(container.firstChild).toBeNull();
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "chat_message_invalid",
      "Invalid message object received",
      expect.objectContaining({ hasSender: true }),
    );
  });

  it("returns null for message with non-string sender (truthy message, logs with hasText=true)", () => {
    const { container } = render(
      // @ts-expect-error purposely invalid type for sender
      <ChatMessage message={{ text: "Hello", sender: 42 }} bot={mockBot} />,
    );
    expect(container.firstChild).toBeNull();
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "chat_message_invalid",
      "Invalid message object received",
      expect.objectContaining({ hasText: true }),
    );
  });
});

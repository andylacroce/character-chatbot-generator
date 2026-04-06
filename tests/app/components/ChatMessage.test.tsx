import React from "react";
import { render, screen } from "@testing-library/react";
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
    const message: Message = { text: "You shall not pass!", sender: "AI" };
    render(<ChatMessage message={message} bot={mockBot} />);
    expect(screen.getByText("Gandalf")).toBeInTheDocument();
    expect(screen.getByText("You shall not pass!")).toBeInTheDocument();
    expect(screen.getByAltText("Gandalf")).toBeInTheDocument();
  });

  it("returns null and logs error for invalid message", () => {
    // @ts-expect-error purposely invalid
    const { container } = render(<ChatMessage message={null} bot={mockBot} />);
    expect(container.firstChild).toBeNull();
    expect(logEvent).toHaveBeenCalledWith(
      'error',
      'chat_message_invalid',
      'Invalid message object received',
      expect.any(Object)
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
      <ChatMessage message={{ text: 123, sender: "User" }} bot={mockBot} />
    );
    expect(container.firstChild).toBeNull();
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "chat_message_invalid",
      "Invalid message object received",
      expect.objectContaining({ hasSender: true })
    );
  });

  it("returns null for message with non-string sender (truthy message, logs with hasText=true)", () => {
    const { container } = render(
      // @ts-expect-error purposely invalid type for sender
      <ChatMessage message={{ text: "Hello", sender: 42 }} bot={mockBot} />
    );
    expect(container.firstChild).toBeNull();
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "chat_message_invalid",
      "Invalid message object received",
      expect.objectContaining({ hasText: true })
    );
  });
});

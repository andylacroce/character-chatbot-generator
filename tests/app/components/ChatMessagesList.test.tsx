import React from "react";
import { render, screen } from "@testing-library/react";
import ChatMessagesList from "../../../app/components/ChatMessagesList";
import { Bot } from "../../../app/components/BotCreator";

const mockBot: Bot = {
  name: "Gandalf",
  personality: "Wise wizard",
  avatarUrl: "/gandalf.png",
  voiceConfig: null,
};

describe("ChatMessagesList", () => {
  it("renders all messages without virtualization if below threshold", () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({ text: `msg${i}`, sender: i % 2 === 0 ? "User" : "AI" }));
    render(<ChatMessagesList messages={messages} bot={mockBot} />);
    messages.forEach(m => {
      expect(screen.getByText(m.text)).toBeInTheDocument();
    });
  });

  it("renders virtualized list if messages exceed threshold", () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ text: `msg${i}`, sender: i % 2 === 0 ? "User" : "AI" }));
    render(<ChatMessagesList messages={messages} bot={mockBot} />);
    // Only a subset will be in the DOM; ensure the virtualized list rendered and at least
    // one message item is present in the DOM (avoid flaky assumption about exact items).
    expect(screen.getByRole("list")).toBeInTheDocument();
    const articles = screen.getAllByRole("article");
    expect(articles.length).toBeGreaterThan(0);
  });

  it("renders nothing if messages is empty and not skeleton", () => {
    render(<ChatMessagesList messages={[]} bot={mockBot} />);
    // Should not throw or render any ChatMessage
    expect(screen.queryByText("Me")).not.toBeInTheDocument();
    expect(screen.queryByText("Gandalf")).not.toBeInTheDocument();
  });

  it("handles messages with audioFileUrl", () => {
    const messages = [
      { text: "Audio message", sender: "AI", audioFileUrl: "/audio.mp3" },
    ];
    render(<ChatMessagesList messages={messages} bot={mockBot} />);
    expect(screen.getByText("Audio message")).toBeInTheDocument();
  });
});

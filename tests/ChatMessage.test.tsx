import React from "react";
import { render, screen } from "@testing-library/react";
import ChatMessage, { Message } from "../app/components/ChatMessage";

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

  it("renders skeleton state", () => {
    const message: Message = { text: "", sender: "AI" };
    render(<ChatMessage message={message} bot={mockBot} skeleton />);
    expect(screen.getByRole("article", { name: /loading message/i })).toBeInTheDocument();
  });

  it("returns null and logs error for invalid message", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    // @ts-expect-error purposely invalid
    const { container } = render(<ChatMessage message={null} bot={mockBot} />);
    expect(container.firstChild).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("handles missing optional audioFileUrl", () => {
    const message: Message = { text: "No audio", sender: "User" };
    render(<ChatMessage message={message} bot={mockBot} />);
    expect(screen.getByText("No audio")).toBeInTheDocument();
  });
});

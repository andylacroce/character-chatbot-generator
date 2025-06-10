import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatPage from "../../../app/components/ChatPage";
import { Bot } from "../../../app/components/BotCreator";
import axios from "axios";
import "@testing-library/jest-dom";

jest.mock("axios");

const mockBot: Bot = {
  name: "Gandalf",
  personality: "wise",
  avatarUrl: "/silhouette.svg", // Required by Bot interface
  voiceConfig: { voice: "en-US-Wavenet-D" },
};

describe("ChatPage API retry logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock scrollIntoView for all elements
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
    // Mock axios.get for health check
    (axios.get as jest.Mock).mockResolvedValue({ data: { status: "ok" } });
  });

  it("retries the chat API request up to 2 times and shows retrying indicator", async () => {
    // First two calls fail, third call succeeds
    (axios.post as jest.Mock)
      .mockRejectedValueOnce(new Error("Network error 1"))
      .mockRejectedValueOnce(new Error("Network error 2"))
      .mockResolvedValueOnce({ data: { reply: "You shall not pass!", audioFileUrl: null } });

    render(<ChatPage bot={mockBot} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Should show retrying indicator after first failure
    await waitFor(() => expect(screen.getByText(/Retrying connection/i)).toBeInTheDocument());

    // Should eventually show the bot reply after retries
    await waitFor(() => expect(screen.getByText(/You shall not pass!/i)).toBeInTheDocument());

    // Should have called axios.post to /api/chat two times (1 initial + 1 retry, then success)
    const chatCalls = (axios.post as jest.Mock).mock.calls.filter(([url]) => url === "/api/chat");
    expect(chatCalls.length).toBe(2); // 1 initial + 1 retry = 2 (success on 2nd retry)
  });

  it("shows error if all retries fail", async () => {
    (axios.post as jest.Mock)
      .mockRejectedValue(new Error("Network error"));

    render(<ChatPage bot={mockBot} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hi" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Should show retrying indicator
    await waitFor(() => expect(screen.getByText(/Retrying connection/i)).toBeInTheDocument());
    // Should show generic error after all retries
    await waitFor(() => {
      const statusArea = screen.getByTestId("chat-status-area");
      expect(statusArea.textContent).toMatch(/error|network/i);
    }, { timeout: 3000 });
    const chatCalls = (axios.post as jest.Mock).mock.calls.filter(([url]) => url === "/api/chat");
    expect(chatCalls.length).toBe(3); // 1 initial + 2 retries = 3
  });
});

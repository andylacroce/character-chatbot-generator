import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatPage from "../../../app/components/ChatPage";
import { Bot } from "../../../app/components/BotCreator";
import axios from "axios";
import "@testing-library/jest-dom";
import { downloadTranscript } from "../../../src/utils/downloadTranscript";

jest.mock("axios");
jest.mock("../../../src/utils/downloadTranscript");

const mockBot: Bot = {
  name: "Gandalf",
  personality: "wise",
  avatarUrl: "/silhouette.svg",
  voiceConfig: {
    languageCodes: ["en-US"],
    name: "en-US-Wavenet-D",
    ssmlGender: 1, // SSML_GENDER.MALE
    pitch: 0,
    rate: 1.0,
    type: "Wavenet",
  },
};

describe("ChatPage full feature coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
    (axios.get as jest.Mock).mockResolvedValue({ data: { status: "ok" } });
    (axios.post as jest.Mock).mockResolvedValue({ data: { reply: "Bot reply", audioFileUrl: null } });
    localStorage.clear();
  });

  it("renders and focuses input after health check", async () => {
    render(<ChatPage bot={mockBot} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveFocus());
  });

  it("toggles audio and persists preference", async () => {
    render(<ChatPage bot={mockBot} />);
    const toggle = screen.getByLabelText(/audio/i);
    fireEvent.click(toggle);
    expect(localStorage.getItem("audioEnabled")).toBe("false");
    fireEvent.click(toggle);
    expect(localStorage.getItem("audioEnabled")).toBe("true");
  });

  it("downloads transcript when header button clicked", async () => {
    render(<ChatPage bot={mockBot} />);
    // Open hamburger menu
    fireEvent.click(screen.getByLabelText(/open menu/i));
    const downloadBtn = screen.getByLabelText(/download chat transcript/i);
    fireEvent.click(downloadBtn);
    expect(downloadTranscript).toHaveBeenCalled();
  });

  it("handles input and sends message on Enter", async () => {
    render(<ChatPage bot={mockBot} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(screen.getByText(/Bot reply/i)).toBeInTheDocument());
  });

  it("shows API unavailable modal if health check fails", async () => {
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error("fail"));
    render(<ChatPage bot={mockBot} />);
    // The modal shows a message about the bot vanishing
    await waitFor(() => expect(screen.getByText(/bot has vanished from the chat/i)).toBeInTheDocument());
  });

  it("calls onBackToCharacterCreation when header back button is clicked", async () => {
    const onBack = jest.fn();
    render(<ChatPage bot={mockBot} onBackToCharacterCreation={onBack} />);
    // Open hamburger menu
    fireEvent.click(screen.getByLabelText(/open menu/i));
    const backBtn = screen.getByLabelText(/back to character creation/i);
    fireEvent.click(backBtn);
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it("loads more messages on scroll to top", async () => {
    render(<ChatPage bot={mockBot} />);
    // Add enough messages to enable scroll
    const input = screen.getByRole("textbox");
    for (let i = 0; i < 25; i++) {
      fireEvent.change(input, { target: { value: `msg${i}` } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    }
    await waitFor(() => expect(screen.getByText(/msg0/)).toBeInTheDocument());
    const chatBox = screen.getByTestId("chat-messages-container");
    Object.defineProperty(chatBox, "scrollTop", { get: () => 0 });
    fireEvent.scroll(chatBox);
    // Should load more messages (visibleCount increases)
    expect(screen.getByText(/msg0/)).toBeInTheDocument();
  });
});

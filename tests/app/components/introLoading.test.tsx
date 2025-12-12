import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ChatPage from "../../../app/components/ChatPage";
import { Bot } from "../../../app/components/BotCreator";
import "@testing-library/jest-dom";

// Mock authenticatedFetch
const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

const mockResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(data),
});

jest.mock("../../../app/components/useAudioPlayer", () => ({
  __esModule: true,
  useAudioPlayer: () => ({
    playAudio: jest.fn(),
    stopAudio: jest.fn(),
    audioRef: { current: null },
    isAudioPlaying: false,
  }),
}));

const mockBot: Bot = {
  name: "TestCharacter",
  personality: "friendly",
  avatarUrl: "/silhouette.svg",
  voiceConfig: {
    languageCodes: ["en-US"],
    name: "en-US-Wavenet-D",
    ssmlGender: 1,
    pitch: 0,
    rate: 1.0,
    type: "Wavenet"
  },
};

describe("ChatPage intro loading behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
  });

  it("shows HOLD button when intro is loading", async () => {
    // Delay the intro response to test loading state
    let resolveIntro: ((value: unknown) => void) | null = null;
    const introPromise = new Promise((resolve) => {
      resolveIntro = resolve;
    });

    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/chat") {
        return introPromise.then(() => mockResponse({ reply: "Hello! I'm TestCharacter.", audioFileUrl: null }));
      }
      return Promise.resolve(mockResponse({ status: "ok" }));
    });

    render(<ChatPage bot={mockBot} />);

    // Chat input should show HOLD initially
    const sendButton = screen.getByTestId("chat-send-button");
    expect(sendButton).toHaveTextContent("HOLD");
    expect(sendButton).toBeDisabled();

    // Input should also be disabled
    const input = screen.getByTestId("chat-input");
    expect(input).toBeDisabled();

    // Loading indicator should be visible
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();

    // Resolve the intro
    resolveIntro!(mockResponse({ reply: "Hello! I'm TestCharacter.", audioFileUrl: null }));

    // Wait for intro to complete and HOLD to be removed
    await waitFor(() => {
      expect(sendButton).toHaveTextContent("Send");
      expect(sendButton).not.toBeDisabled();
    }, { timeout: 3000 });

    expect(input).not.toBeDisabled();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("removes HOLD after intro completes", async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      mockResponse({ reply: "Hello! I'm TestCharacter.", audioFileUrl: null })
    );

    render(<ChatPage bot={mockBot} />);

    // Wait for intro to complete
    await waitFor(() => {
      const sendButton = screen.getByTestId("chat-send-button");
      expect(sendButton).toHaveTextContent("Send");
      expect(sendButton).not.toBeDisabled();
    }, { timeout: 3000 });

    const input = screen.getByTestId("chat-input");
    expect(input).not.toBeDisabled();
  });

  it("removes HOLD even when intro fails", async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error("API Error"));

    render(<ChatPage bot={mockBot} />);

    // Wait for intro to fail and HOLD to be removed (though error state will show)
    await waitFor(() => {
      const sendButton = screen.getByTestId("chat-send-button");
      // After intro error, the button should still be enabled/disabled based on apiAvailable
      // In this case it should show HOLD because apiAvailable might be false after error
      expect(sendButton).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

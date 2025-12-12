import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatPage from "../../../../app/components/ChatPage";
import { Bot } from "../../../../app/components/BotCreator";
import "@testing-library/jest-dom";

// Mock authenticatedFetch instead of axios
const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

const mockResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(data),
});

jest.mock("../../../../app/components/useAudioPlayer", () => ({
  __esModule: true,
  useAudioPlayer: () => ({
    playAudio: jest.fn(),
    stopAudio: jest.fn(),
    audioRef: { current: null },
    isAudioPlaying: false,
  }),
}));

const mockBot: Bot = {
  name: "Gandalf",
  personality: "wise",
  avatarUrl: "/silhouette.svg", // Required by Bot interface
  // Provide a valid CharacterVoiceConfig shape
  voiceConfig: {
    languageCodes: ["en-US"],
    name: "en-US-Wavenet-D",
    ssmlGender: 1,
    pitch: 0,
    rate: 1.0,
    type: "Wavenet"
  },
};

describe("ChatPage API retry logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear(); // Clear chat history between tests
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
    mockAuthenticatedFetch.mockResolvedValue(mockResponse({ status: "ok" }));
  });

  it("calls the chat API 3 times and shows retrying indicator at least once if all fail", async () => {
    let chatCallCount = 0;
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/health") {
        return Promise.resolve(mockResponse({ status: "ok" }));
      }
      if (url === "/api/log-message") {
        return Promise.resolve(mockResponse({ status: "ok" }));
      }
      if (url === "/api/chat") {
        chatCallCount++;
        // First call is intro - succeed
        if (chatCallCount === 1) {
          return Promise.resolve(mockResponse({ reply: 'Welcome!', audioFileUrl: null }));
        }
        // Subsequent calls (user message) - fail 3 times
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve(mockResponse({ status: "ok" }));
    });

    render(<ChatPage bot={mockBot} />);
    
    // Wait for intro to complete
    await waitFor(() => {
      const sendButton = screen.getByTestId("chat-send-button");
      expect(sendButton).not.toBeDisabled();
    });
    
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Wait for retrying indicator to appear at least once
    expect(await screen.findByTestId("retrying-message", {}, { timeout: 500 })).toBeInTheDocument();

    // Wait for all authenticatedFetch calls (1 intro + 3 retries = 4 total)
    await waitFor(() => {
      const chatCalls = mockAuthenticatedFetch.mock.calls.filter(([url]) => url === "/api/chat");
      expect(chatCalls.length).toBe(4); // 1 intro + 3 retry attempts
    }, { timeout: 1000 });
  });

  it("calls the chat API 3 times and shows retrying indicator if retry eventually succeeds", async () => {
    let chatCallCount = 0;
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/health") {
        return Promise.resolve(mockResponse({ status: "ok" }));
      }
      if (url === "/api/log-message") {
        return Promise.resolve(mockResponse({ status: "ok" }));
      }
      if (url === "/api/chat") {
        chatCallCount++;
        // First call is intro - succeed
        if (chatCallCount === 1) {
          return Promise.resolve(mockResponse({ reply: 'Welcome!', audioFileUrl: null }));
        }
        // Second and third calls fail
        if (chatCallCount === 2 || chatCallCount === 3) {
          return Promise.reject(new Error(`Network error ${chatCallCount - 1}`));
        }
        // Fourth call succeeds
        return Promise.resolve(mockResponse({ reply: 'You shall not pass!', audioFileUrl: null }));
      }
      return Promise.resolve(mockResponse({ status: "ok" }));
    });

    render(<ChatPage bot={mockBot} />);
    
    // Wait for intro to complete
    await waitFor(() => {
      const sendButton = screen.getByTestId("chat-send-button");
      expect(sendButton).not.toBeDisabled();
    });
    
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hi" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Wait for retrying indicator to appear at least once
    expect(await screen.findByTestId("retrying-message", {}, { timeout: 500 })).toBeInTheDocument();

    // Wait for all authenticatedFetch calls to /api/chat (1 intro + 3 attempts = 4 total)
    await waitFor(() => {
      const chatCalls = mockAuthenticatedFetch.mock.calls.filter(([url]) => url === "/api/chat");
      expect(chatCalls.length).toBe(4); // 1 intro + 3 retry attempts (2 fail, 1 succeed)
    }, { timeout: 1000 });
  });
});

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatPage from "../../../app/components/ChatPage";
import { Bot } from "../../../app/components/BotCreator";
import "@testing-library/jest-dom";

// Mock authenticatedFetch instead of axios
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
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
    mockAuthenticatedFetch.mockResolvedValue(mockResponse({ status: "ok" }));
  });

  it("calls the chat API 3 times and shows retrying indicator at least once if all fail", async () => {
    mockAuthenticatedFetch
      .mockRejectedValueOnce(new Error('Network error 1'))
      .mockRejectedValueOnce(new Error('Network error 2'))
      .mockRejectedValue(new Error('Network error 3'));

    render(<ChatPage bot={mockBot} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Wait for retrying indicator to appear at least once
    expect(await screen.findByTestId("retrying-message", {}, { timeout: 3000 })).toBeInTheDocument();

    // Wait for all authenticatedFetch calls
    await waitFor(() => {
      const chatCalls = mockAuthenticatedFetch.mock.calls.filter(([url]) => url === "/api/chat");
      expect(chatCalls.length).toBe(3);
    }, { timeout: 4000 });
  });

  it("calls the chat API 3 times and shows retrying indicator if retry eventually succeeds", async () => {
    // Mock intro to succeed so it doesn't consume retry mocks
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: 'Welcome!', audioFileUrl: null }));
    
    // Then mock the user message retries
    mockAuthenticatedFetch
      .mockRejectedValueOnce(new Error('Network error 1'))
      .mockRejectedValueOnce(new Error('Network error 2'))
      .mockResolvedValueOnce(mockResponse({ reply: 'You shall not pass!', audioFileUrl: null }));

    render(<ChatPage bot={mockBot} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hi" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // Wait for retrying indicator to appear at least once
    expect(await screen.findByTestId("retrying-message", {}, { timeout: 3000 })).toBeInTheDocument();

    // Wait for all authenticatedFetch calls to /api/chat
    await waitFor(() => {
      const chatCalls = mockAuthenticatedFetch.mock.calls.filter(([url]) => url === "/api/chat");
      expect(chatCalls.length).toBe(3); // 3 retries (intro failed)
    }, { timeout: 4000 });
  });
});

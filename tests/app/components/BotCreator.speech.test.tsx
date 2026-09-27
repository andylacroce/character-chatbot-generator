import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BotCreator from "../../../src/app/components/BotCreator";

const mockSearchParams = new URLSearchParams();
const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

// BotCreator renders AuthControl, which needs a SessionProvider ancestor
// (next-auth throws otherwise) — mock the hook directly instead.
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getProviders: () => Promise.resolve({ google: { id: "google", name: "Google" } }),
}));

// Mock the hook itself (not the browser API a second time) so this file verifies
// BotCreator's orchestration — transcript-to-input wiring, the busy guard, error
// routing, and force-stopping on submit — per useSpeechRecognition.test.ts covering
// the browser-API wrapper's own behavior, and useChatController.speech.test.ts's
// equivalent orchestration coverage for ordinary chat.
const mockStartRecording = jest.fn();
const mockStopRecording = jest.fn();
const mockToggleRecording = jest.fn();
let mockIsSupported = true;
let mockIsRecording = false;
let mockTranscript = "";
let mockSpeechError: string | null = null;
jest.mock("../../../src/app/components/useSpeechRecognition", () => ({
  useSpeechRecognition: () => ({
    isSupported: mockIsSupported,
    isRecording: mockIsRecording,
    transcript: mockTranscript,
    error: mockSpeechError,
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    toggleRecording: mockToggleRecording,
  }),
}));

function mockFetchRouter(handlers: Record<string, () => Promise<unknown>>) {
  // @ts-expect-error test-mock: assign mocked fetch to global
  global.fetch = jest.fn((url: string) => {
    for (const [prefix, handler] of Object.entries(handlers)) {
      if (url === prefix || url.startsWith(prefix)) return handler();
    }
    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
}

const configHandler = () =>
  Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) });
const validatingForeverHandler = () => new Promise(() => {}); // never resolves

describe("BotCreator voice input orchestration", () => {
  beforeEach(() => {
    mockSearchParams.delete("name");
    localStorage.clear();
    mockIsSupported = true;
    mockIsRecording = false;
    mockTranscript = "";
    mockSpeechError = null;
    jest.clearAllMocks();
    mockFetchRouter({ "/api/config": configHandler });
  });

  afterEach(() => {
    // @ts-expect-error test-mock: remove mocked fetch from global
    delete global.fetch;
  });

  it("overwrites the character-name field with the live transcript while recording", async () => {
    mockIsRecording = true;
    mockTranscript = "sherlock holmes";
    render(<BotCreator onBotCreated={() => {}} />);
    const input = await screen.findByTestId("bot-creator-input");
    expect(input).toHaveValue("sherlock holmes");
  });

  it("does not touch the field when not recording", async () => {
    mockIsRecording = false;
    mockTranscript = "stale transcript";
    render(<BotCreator onBotCreated={() => {}} />);
    const input = await screen.findByTestId("bot-creator-input");
    expect(input).toHaveValue("");
  });

  it("routes a speech error into the same error banner used for other creation errors", async () => {
    mockSpeechError = "No microphone was found. Please check your device.";
    render(<BotCreator onBotCreated={() => {}} />);
    expect(
      await screen.findByText("No microphone was found. Please check your device."),
    ).toBeInTheDocument();
  });

  it("clicking the mic toggle calls toggleRecording while idle", async () => {
    render(<BotCreator onBotCreated={() => {}} />);
    const micButton = await screen.findByTestId("bot-creator-mic-toggle");
    fireEvent.click(micButton);
    expect(mockToggleRecording).toHaveBeenCalledTimes(1);
  });

  it("hides the mic button once validation/generation makes the form busy", async () => {
    // Skip the one-time "what's your name" gate so submitting goes straight to
    // validation instead of pausing on that modal first.
    localStorage.setItem("chatbot-user-name-gate-skipped", "1");
    mockFetchRouter({
      "/api/config": configHandler,
      "/api/validate-character": validatingForeverHandler,
    });
    render(<BotCreator onBotCreated={() => {}} />);
    const input = await screen.findByTestId("bot-creator-input");
    fireEvent.change(input, { target: { value: "Sherlock Holmes" } });
    fireEvent.click(screen.getByTestId("bot-creator-button"));

    await waitFor(() => expect(screen.getByTestId("bot-creator-validating")).toBeInTheDocument());
    expect(screen.queryByTestId("bot-creator-mic-toggle")).not.toBeInTheDocument();
  });

  it("force-stops any in-progress recording the moment a name is submitted", async () => {
    localStorage.setItem("chatbot-user-name-gate-skipped", "1");
    mockFetchRouter({
      "/api/config": configHandler,
      "/api/validate-character": validatingForeverHandler,
    });
    render(<BotCreator onBotCreated={() => {}} />);
    const input = await screen.findByTestId("bot-creator-input");
    fireEvent.change(input, { target: { value: "Sherlock Holmes" } });
    fireEvent.click(screen.getByTestId("bot-creator-button"));

    await waitFor(() => expect(mockStopRecording).toHaveBeenCalled());
  });
});

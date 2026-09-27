import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

let mockIsSupported = true;
let mockIsRecording = false;
jest.mock("../../../src/app/components/useSpeechRecognition", () => ({
  useSpeechRecognition: () => ({
    isSupported: mockIsSupported,
    isRecording: mockIsRecording,
    transcript: "",
    error: null,
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    toggleRecording: jest.fn(),
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

describe("BotCreator mic toggle", () => {
  beforeEach(() => {
    mockSearchParams.delete("name");
    localStorage.clear();
    mockIsSupported = true;
    mockIsRecording = false;
    mockFetchRouter({ "/api/config": configHandler });
  });

  afterEach(() => {
    // @ts-expect-error test-mock: remove mocked fetch from global
    delete global.fetch;
  });

  it("does not render when speech is unsupported", async () => {
    mockIsSupported = false;
    render(<BotCreator onBotCreated={() => {}} />);
    await screen.findByTestId("bot-creator-input");
    expect(screen.queryByTestId("bot-creator-mic-toggle")).not.toBeInTheDocument();
  });

  it("renders when speech is supported and calls toggleRecording on click", async () => {
    const user = userEvent.setup();
    render(<BotCreator onBotCreated={() => {}} />);
    const micBtn = await screen.findByTestId("bot-creator-mic-toggle");
    expect(micBtn).toBeInTheDocument();
    await user.click(micBtn);
  });

  it("reflects recording state via aria-pressed and label", async () => {
    mockIsRecording = true;
    render(<BotCreator onBotCreated={() => {}} />);
    const micBtn = await screen.findByTestId("bot-creator-mic-toggle");
    expect(micBtn).toHaveAttribute("aria-pressed", "true");
    expect(micBtn).toHaveAttribute("aria-label", "Stop voice input");
  });

  it("shows the idle label and aria-pressed=false when not recording", async () => {
    mockIsRecording = false;
    render(<BotCreator onBotCreated={() => {}} />);
    const micBtn = await screen.findByTestId("bot-creator-mic-toggle");
    expect(micBtn).toHaveAttribute("aria-pressed", "false");
    expect(micBtn).toHaveAttribute("aria-label", "Start voice input");
  });
});

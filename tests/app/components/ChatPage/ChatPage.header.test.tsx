import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ChatPage from "../../../../app/components/ChatPage";
import { Bot } from "../../../../app/components/BotCreator";
import { mockResponse } from "../../../helpers/mockResponse";

// The server-history reconciliation effect (and useUserName) need a next-auth session
// status; default to unauthenticated so both are no-ops and assertions here are
// unaffected by account-persistence behavior.
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  getProviders: () => Promise.resolve({}),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

jest.mock("../../../../src/utils/downloadTranscript");
import { downloadTranscript } from "../../../../src/utils/downloadTranscript";

jest.mock("../../../../app/components/useAudioPlayer", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../app/components/useAudioPlayer"),
  useAudioPlayer: jest.fn(() => ({
    playAudio: jest.fn(),
    stopAudio: jest.fn(),
    audioRef: { current: null },
  })),
}));

const mockBot: Bot = {
  name: "Gandalf",
  personality: "wise",
  avatarUrl: "/silhouette.svg",
  voiceConfig: {
    languageCodes: ["en-US"],
    name: "en-US-Wavenet-D",
    ssmlGender: 1,
    pitch: 0,
    rate: 1.0,
    type: "Wavenet",
  },
};

describe("ChatPage header content (moved from ChatHeader into AppHeader's slots)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
    mockAuthenticatedFetch.mockResolvedValue(
      mockResponse({ reply: "Bot reply", audioFileUrl: null }),
    );
    localStorage.clear();
  });

  afterEach(async () => {
    try {
      await act(async () => {
        await new Promise((res) => setTimeout(res, 20));
      });
    } catch {
      /* draining stragglers only */
    }
  });

  it("renders bot name and avatar in the header's center slot", async () => {
    render(<ChatPage bot={mockBot} />);
    expect(screen.getByText("Gandalf")).toBeInTheDocument();
    expect(screen.getByAltText("Gandalf")).toBeInTheDocument();
  });

  it("calls onBackToCharacterCreation when the menu's back button is clicked", () => {
    const onBack = jest.fn();
    render(<ChatPage bot={mockBot} onBackToCharacterCreation={onBack} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByLabelText(/back to character creation/i));
    expect(onBack).toHaveBeenCalled();
  });

  it("downloads the transcript and refocuses input when Download Transcript is clicked", async () => {
    render(<ChatPage bot={mockBot} />);
    await screen.findByRole("textbox");
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByLabelText(/download chat transcript/i));
    expect(downloadTranscript).toHaveBeenCalled();
  });

  it("hides the Download Transcript button for a character created past an overridden copyright warning", () => {
    render(<ChatPage bot={{ ...mockBot, skipPersistence: true }} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    expect(screen.queryByLabelText(/download chat transcript/i)).not.toBeInTheDocument();
  });

  it("links to the public character wall from the menu, even for a skipPersistence character", () => {
    render(<ChatPage bot={{ ...mockBot, skipPersistence: true }} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    const link = screen.getByLabelText(/view the character wall/i);
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/chars");
  });

  it("offers to add a name from the menu, and opens the name-capture modal", () => {
    render(<ChatPage bot={mockBot} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByText("Add your name"));
    expect(screen.getByText("Change your name")).toBeInTheDocument();
    // The chat header now folds in useAccountMenu's items, so "sign in instead" is
    // offered here too, same as every other page's name-capture modal.
    expect(screen.getByText("Sign in instead")).toBeInTheDocument();
  });

  it("includes the shared account menu (identity label, sign in) in the hamburger", () => {
    render(<ChatPage bot={mockBot} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.getByLabelText(/sign in/i)).toBeInTheDocument();
  });

  it("opens the shared portrait lightbox when the header avatar is clicked", () => {
    render(<ChatPage bot={mockBot} />);
    fireEvent.click(screen.getByLabelText(/view character portrait/i));
    // ModalImageViewer is dynamically imported; presence of the enlarged image confirms it opened.
    expect(screen.getAllByAltText("Gandalf").length).toBeGreaterThan(1);
  });

  it("visiting the personal brand link refocuses the chat input", async () => {
    render(<ChatPage bot={mockBot} />);
    const input = await screen.findByRole("textbox");
    input.blur();
    fireEvent.click(screen.getByLabelText(/visit andy lacroce's website/i));
    expect(input).toHaveFocus();
  });
});

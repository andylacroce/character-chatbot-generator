import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GuessWhoPage from "../../../src/app/components/GuessWhoPage";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../../src/app/components/LeaderboardClaim", () => ({
  __esModule: true,
  default: () => null,
}));

// GuessWhoPage folds useAccountMenu's items (identity label, change name, sign in/out,
// admin) into its own menu — default to unauthenticated so those assertions are
// unaffected by account-persistence behavior.
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  getProviders: () => Promise.resolve({}),
}));

const mockStartGame = jest.fn();
const mockQuitGame = jest.fn();
const mockGiveUp = jest.fn();
const mockSendMessage = jest.fn();
const mockContinueRound = jest.fn();
const mockClearGiveUpRequest = jest.fn();
const mockHandleKeyDown = jest.fn();
const mockHandleAudioToggle = jest.fn();
const mockStopAudio = jest.fn();
const mockSetInput = jest.fn();

let controllerState: Record<string, unknown>;

jest.mock("../../../src/app/components/useGuessWhoController", () => ({
  useGuessWhoController: () => controllerState,
}));

function baseController(overrides: Record<string, unknown> = {}) {
  const state = {
    started: false,
    starting: false,
    streak: 0,
    messages: [],
    input: "",
    setInput: mockSetInput,
    loading: false,
    error: "",
    lastEvent: null,
    awaitingContinue: false,
    continueRound: mockContinueRound,
    continuing: false,
    continueProgressMessage: "Starting…",
    giveUpRequested: false,
    clearGiveUpRequest: mockClearGiveUpRequest,
    chatBoxRef: { current: null },
    inputRef: { current: null },
    audioEnabled: true,
    handleAudioToggle: mockHandleAudioToggle,
    stopAudio: mockStopAudio,
    isAudioPlaying: false,
    startGame: mockStartGame,
    quitGame: mockQuitGame,
    giveUp: mockGiveUp,
    startProgressMessage: "Starting…",
    sendMessage: mockSendMessage,
    handleKeyDown: mockHandleKeyDown,
    highScore: null,
    ...overrides,
  };
  // Mirrors useGuessWhoSession: a just-won streak shows while awaiting Continue.
  const lastEvent = state.lastEvent as { type: string; streak?: number } | null;
  return {
    ...state,
    displayedStreak: lastEvent?.type === "correct" ? lastEvent.streak : state.streak,
  };
}

describe("GuessWhoPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    controllerState = baseController();
  });

  it("renders the start screen before a run begins", () => {
    render(<GuessWhoPage />);
    expect(screen.getByText("Guess Who?")).toBeInTheDocument();
    expect(screen.getByTestId("guess-who-start-button")).toBeInTheDocument();
  });

  it("calls startGame when Start Game is clicked", () => {
    render(<GuessWhoPage />);
    fireEvent.click(screen.getByTestId("guess-who-start-button"));
    expect(mockStartGame).toHaveBeenCalled();
  });

  it("shows staged progress while starting", () => {
    controllerState = baseController({
      starting: true,
      startProgressMessage: "Generating portrait…",
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-start-progress")).toBeInTheDocument();
    expect(screen.getByText("Generating portrait…")).toBeInTheDocument();
    expect(screen.getByTestId("guess-who-start-button")).toBeDisabled();
  });

  it("shows the game-over screen with the reveal and a Play Again button", () => {
    controllerState = baseController({
      lastEvent: { type: "gameover", revealedName: "Edmund Ironside", finalStreak: 3 },
    });
    render(<GuessWhoPage />);
    expect(screen.getByText("Game Over")).toBeInTheDocument();
    expect(screen.getByText("It was Edmund Ironside. Final streak: 3.")).toBeInTheDocument();
    expect(screen.getByTestId("guess-who-play-again-button")).toBeInTheDocument();
    const leaderboardButton = screen.getByRole("button", { name: "View leaderboard" });
    fireEvent.click(leaderboardButton);
    expect(mockPush).toHaveBeenCalledWith("/leaderboard");
  });

  it("renders the chat shell with the mystery placeholder while a run is hidden", () => {
    controllerState = baseController({
      started: true,
      streak: 2,
      messages: [{ sender: "???", text: "Greetings, traveler." }],
    });
    render(<GuessWhoPage />);
    expect(screen.getAllByText("???").length).toBeGreaterThan(0);
    expect(screen.getByText("Greetings, traveler.")).toBeInTheDocument();
    expect(screen.getByTestId("guess-who-streak-badge")).toHaveTextContent("Streak: 2");
  });

  it("reveals the real name and avatar once the guess is correct", () => {
    controllerState = baseController({
      started: true,
      streak: 0,
      lastEvent: {
        type: "correct",
        revealedName: "Irene Adler",
        avatarUrl: "https://example.com/irene.png",
        gender: "female",
        streak: 1,
      },
      awaitingContinue: true,
      messages: [{ sender: "???", text: "Yes, that's me!" }],
    });
    render(<GuessWhoPage />);
    expect(screen.getAllByText("Irene Adler").length).toBeGreaterThan(0);
  });

  it("shows the visitor's own preferred name on their messages instead of the generic 'Me'", () => {
    localStorage.setItem("chatbot-user-name", "Andy");
    controllerState = baseController({
      started: true,
      messages: [
        { sender: "???", text: "Greetings." },
        { sender: "User", text: "Hello!" },
      ],
    });
    render(<GuessWhoPage />);
    expect(screen.getByText("Andy")).toBeInTheDocument();
    expect(screen.queryByText("Me")).not.toBeInTheDocument();
  });

  it("shows the personal best next to the streak when the player has one", () => {
    controllerState = baseController({
      started: true,
      streak: 2,
      highScore: 5,
      messages: [{ sender: "???", text: "Greetings." }],
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-high-score-badge")).toHaveTextContent("Best: 5");
  });

  it("hides the personal best badge for a guest (no high score on record)", () => {
    controllerState = baseController({
      started: true,
      streak: 2,
      highScore: null,
      messages: [{ sender: "???", text: "Greetings." }],
    });
    render(<GuessWhoPage />);
    expect(screen.queryByTestId("guess-who-high-score-badge")).not.toBeInTheDocument();
  });

  it("ends the run when Back to Home is clicked from the menu", () => {
    controllerState = baseController({ started: true });
    render(<GuessWhoPage />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByText("Back to Home"));
    expect(mockQuitGame).toHaveBeenCalled();
  });

  it("shows a confirmation before giving up, and only calls giveUp once confirmed", () => {
    controllerState = baseController({ started: true });
    render(<GuessWhoPage />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByText("Give Up"));
    expect(screen.getByText("Give up this run?")).toBeInTheDocument();
    expect(mockGiveUp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Yes, give up"));
    expect(mockGiveUp).toHaveBeenCalledWith(true);
  });

  it("cancels the give-up confirmation without calling giveUp", () => {
    controllerState = baseController({ started: true });
    render(<GuessWhoPage />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByText("Give Up"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Give up this run?")).not.toBeInTheDocument();
    expect(mockGiveUp).not.toHaveBeenCalled();
  });

  it("opens the give-up confirmation when the server detects a give-up request typed in chat", () => {
    controllerState = baseController({
      started: true,
      giveUpRequested: true,
    });
    render(<GuessWhoPage />);
    expect(screen.getByText("Give up this run?")).toBeInTheDocument();
    expect(mockClearGiveUpRequest).toHaveBeenCalled();
  });

  it("reopens the instructions modal from the menu", () => {
    localStorage.setItem("chatbot-guess-who-instructions-seen", "true");
    controllerState = baseController({ started: true });
    render(<GuessWhoPage />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByText("How to Play"));
    expect(screen.getByText("How to play Guess Who")).toBeInTheDocument();
  });

  it("shows the how-to-play modal automatically on a visitor's first visit", () => {
    controllerState = baseController({ started: true });
    render(<GuessWhoPage />);
    expect(screen.getByText("How to play Guess Who")).toBeInTheDocument();
  });

  it("does not show the how-to-play modal again once it's been seen", () => {
    localStorage.setItem("chatbot-guess-who-instructions-seen", "true");
    controllerState = baseController({ started: true });
    render(<GuessWhoPage />);
    expect(screen.queryByText("How to play Guess Who")).not.toBeInTheDocument();
  });

  it("shows the correct-guess banner", () => {
    controllerState = baseController({
      started: true,
      lastEvent: {
        type: "correct",
        revealedName: "Irene Adler",
        avatarUrl: "https://example.com/irene.png",
        gender: "female",
        streak: 1,
      },
      awaitingContinue: true,
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-event-correct")).toBeInTheDocument();
  });

  it("shows a Continue button while awaiting the round switch, and applies it on click", () => {
    controllerState = baseController({
      started: true,
      lastEvent: {
        type: "correct",
        revealedName: "Irene Adler",
        avatarUrl: "https://example.com/irene.png",
        gender: "female",
        streak: 1,
      },
      awaitingContinue: true,
    });
    render(<GuessWhoPage />);
    const continueButton = screen.getByTestId("guess-who-continue-button");
    expect(continueButton).toBeInTheDocument();

    fireEvent.click(continueButton);
    expect(mockContinueRound).toHaveBeenCalled();
  });

  it("shows a staged progress spinner while the next mystery character is being generated, instead of the correct-guess banner", () => {
    controllerState = baseController({
      started: true,
      lastEvent: null,
      awaitingContinue: false,
      continuing: true,
      continueProgressMessage: "Generating portrait…",
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-continue-progress")).toHaveTextContent(
      "Generating portrait…",
    );
    expect(screen.queryByTestId("guess-who-event-correct")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-input")).toBeDisabled();
  });

  it("shows the new streak in the header badge while the correct-guess overlay is up, not the stale pre-round value", () => {
    controllerState = baseController({
      started: true,
      streak: 0,
      lastEvent: {
        type: "correct",
        revealedName: "Irene Adler",
        avatarUrl: "https://example.com/irene.png",
        gender: "female",
        streak: 1,
      },
      awaitingContinue: true,
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-streak-badge")).toHaveTextContent("Streak: 1");
  });

  it("disables the chat input while awaiting the round switch", () => {
    controllerState = baseController({
      started: true,
      lastEvent: {
        type: "correct",
        revealedName: "Irene Adler",
        avatarUrl: "https://example.com/irene.png",
        gender: "female",
        streak: 1,
      },
      awaitingContinue: true,
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("chat-input")).toBeDisabled();
  });

  it("shows the wrong-guess banner", () => {
    controllerState = baseController({
      started: true,
      lastEvent: { type: "wrong", wrongGuessesRemaining: 1 },
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-event-wrong")).toBeInTheDocument();
  });
});

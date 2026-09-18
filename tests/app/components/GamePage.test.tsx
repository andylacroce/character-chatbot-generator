import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GamePage from "../../../app/components/GamePage";

// GamePage now folds useAccountMenu's items (identity label, change name, sign in/out,
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

jest.mock("../../../app/components/useGameController", () => ({
  useGameController: () => controllerState,
}));

function baseController(overrides: Record<string, unknown> = {}) {
  return {
    started: false,
    starting: false,
    currentCharacterName: "",
    avatarUrl: "/silhouette.svg",
    voiceGender: null,
    streak: 0,
    messages: [],
    input: "",
    setInput: mockSetInput,
    loading: false,
    error: "",
    lastEvent: null,
    awaitingContinue: false,
    continueRound: mockContinueRound,
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
    ...overrides,
  };
}

describe("GamePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    controllerState = baseController();
  });

  it("renders the start screen before a run begins", () => {
    render(<GamePage />);
    expect(screen.getByText("Guess Who's Next?")).toBeInTheDocument();
    expect(screen.getByTestId("game-start-button")).toBeInTheDocument();
  });

  it("calls startGame when Start Game is clicked", () => {
    render(<GamePage />);
    fireEvent.click(screen.getByTestId("game-start-button"));
    expect(mockStartGame).toHaveBeenCalled();
  });

  it("shows staged progress while starting", () => {
    controllerState = baseController({
      starting: true,
      startProgressMessage: "Generating portrait…",
    });
    render(<GamePage />);
    expect(screen.getByTestId("game-start-progress")).toBeInTheDocument();
    expect(screen.getByText("Generating portrait…")).toBeInTheDocument();
    expect(screen.getByTestId("game-start-button")).toBeDisabled();
  });

  it("shows the game-over screen with the reveal and a Play Again button", () => {
    controllerState = baseController({
      lastEvent: { type: "gameover", revealedName: "Edmund Ironside", finalStreak: 3 },
    });
    render(<GamePage />);
    expect(screen.getByText("Game Over")).toBeInTheDocument();
    expect(screen.getByText("Edmund Ironside")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByTestId("game-play-again-button")).toBeInTheDocument();
  });

  it("renders the chat shell with the streak badge once a run has started", () => {
    controllerState = baseController({
      started: true,
      currentCharacterName: "Sherlock Holmes",
      streak: 2,
      messages: [{ sender: "Sherlock Holmes", text: "Greetings." }],
    });
    render(<GamePage />);
    expect(screen.getAllByText("Sherlock Holmes").length).toBeGreaterThan(0);
    expect(screen.getByText("Greetings.")).toBeInTheDocument();
    expect(screen.getByTestId("game-streak-badge")).toHaveTextContent("Streak: 2");
  });

  it("ends the run when Back to Home is clicked from the menu", () => {
    controllerState = baseController({ started: true, currentCharacterName: "Sherlock Holmes" });
    render(<GamePage />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByText("Back to Home"));
    expect(mockQuitGame).toHaveBeenCalled();
  });

  it("shows a confirmation before giving up, and only calls giveUp once confirmed", () => {
    controllerState = baseController({ started: true, currentCharacterName: "Sherlock Holmes" });
    render(<GamePage />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByText("Give Up"));
    expect(screen.getByText("Give up this run?")).toBeInTheDocument();
    expect(mockGiveUp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Yes, give up"));
    expect(mockGiveUp).toHaveBeenCalledWith(true);
  });

  it("cancels the give-up confirmation without calling giveUp", () => {
    controllerState = baseController({ started: true, currentCharacterName: "Sherlock Holmes" });
    render(<GamePage />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByText("Give Up"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Give up this run?")).not.toBeInTheDocument();
    expect(mockGiveUp).not.toHaveBeenCalled();
  });

  it("opens the give-up confirmation when the server detects a give-up request typed in chat", () => {
    controllerState = baseController({
      started: true,
      currentCharacterName: "Sherlock Holmes",
      giveUpRequested: true,
    });
    render(<GamePage />);
    expect(screen.getByText("Give up this run?")).toBeInTheDocument();
    expect(mockClearGiveUpRequest).toHaveBeenCalled();
  });

  it("reopens the instructions modal from the menu", () => {
    localStorage.setItem("chatbot-game-instructions-seen", "true");
    controllerState = baseController({ started: true, currentCharacterName: "Sherlock Holmes" });
    render(<GamePage />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(screen.getByText("How to Play"));
    expect(screen.getByText("How to play")).toBeInTheDocument();
  });

  it("shows the how-to-play modal automatically on a visitor's first visit", () => {
    controllerState = baseController({ started: true, currentCharacterName: "Sherlock Holmes" });
    render(<GamePage />);
    expect(screen.getByText("How to play")).toBeInTheDocument();
  });

  it("does not show the how-to-play modal again once it's been seen", () => {
    localStorage.setItem("chatbot-game-instructions-seen", "true");
    controllerState = baseController({ started: true, currentCharacterName: "Sherlock Holmes" });
    render(<GamePage />);
    expect(screen.queryByText("How to play")).not.toBeInTheDocument();
  });

  it("shows the correct-guess banner", () => {
    controllerState = baseController({
      started: true,
      currentCharacterName: "Irene Adler",
      lastEvent: { type: "correct", revealedName: "Irene Adler", streak: 1 },
    });
    render(<GamePage />);
    expect(screen.getByTestId("game-event-correct")).toBeInTheDocument();
  });

  it("shows a Continue button while awaiting the round switch, and applies it on click", () => {
    controllerState = baseController({
      started: true,
      currentCharacterName: "Sherlock Holmes",
      lastEvent: { type: "correct", revealedName: "Irene Adler", streak: 1 },
      awaitingContinue: true,
    });
    render(<GamePage />);
    const continueButton = screen.getByTestId("game-continue-button");
    expect(continueButton).toBeInTheDocument();
    // The passive "Say hello..." banner variant is not shown while a Continue action
    // is pending — the button itself is the only way to advance.
    expect(screen.queryByText(/Say hello to your/)).not.toBeInTheDocument();

    fireEvent.click(continueButton);
    expect(mockContinueRound).toHaveBeenCalled();
  });

  it("disables the chat input while awaiting the round switch", () => {
    controllerState = baseController({
      started: true,
      currentCharacterName: "Sherlock Holmes",
      lastEvent: { type: "correct", revealedName: "Irene Adler", streak: 1 },
      awaitingContinue: true,
    });
    render(<GamePage />);
    expect(screen.getByTestId("chat-input")).toBeDisabled();
  });

  it("shows the wrong-guess banner", () => {
    controllerState = baseController({
      started: true,
      currentCharacterName: "Sherlock Holmes",
      lastEvent: { type: "wrong", wrongGuessesRemaining: 1 },
    });
    render(<GamePage />);
    expect(screen.getByTestId("game-event-wrong")).toBeInTheDocument();
  });
});

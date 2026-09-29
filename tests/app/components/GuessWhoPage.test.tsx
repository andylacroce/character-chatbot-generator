import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GuessWhoPage from "../../../src/app/components/GuessWhoPage";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../../src/app/components/LeaderboardClaim", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  getProviders: () => Promise.resolve({}),
}));

const mockStartGame = jest.fn();
const mockQuitGame = jest.fn();
const mockGiveUp = jest.fn();
const mockSubmitGuess = jest.fn();
const mockContinueRound = jest.fn();
const mockSetGuess = jest.fn();
const mockHandleKeyDown = jest.fn();

let controllerState: Record<string, unknown>;

jest.mock("../../../src/app/components/useGuessWhoController", () => ({
  useGuessWhoController: () => controllerState,
}));

function baseController(overrides: Record<string, unknown> = {}) {
  const state = {
    started: false,
    starting: false,
    clue: "",
    clueNumber: 0,
    totalClues: 0,
    streak: 0,
    highScore: null,
    guess: "",
    setGuess: mockSetGuess,
    loading: false,
    error: "",
    lastEvent: null,
    awaitingContinue: false,
    continueRound: mockContinueRound,
    continuing: false,
    startGame: mockStartGame,
    quitGame: mockQuitGame,
    giveUp: mockGiveUp,
    submitGuess: mockSubmitGuess,
    handleKeyDown: mockHandleKeyDown,
    ...overrides,
  };
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

  it("shows the clue card and streak badge once a run has started", () => {
    controllerState = baseController({
      started: true,
      clue: "A queen from ancient Egypt.",
      clueNumber: 1,
      totalClues: 5,
      streak: 2,
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-clue-card")).toHaveTextContent(
      "A queen from ancient Egypt.",
    );
    expect(screen.getByTestId("guess-who-streak-badge")).toHaveTextContent("Streak: 2");
  });

  it("submits a guess when the guess form is submitted", () => {
    controllerState = baseController({ started: true, clue: "Clue 1", guess: "Cleopatra" });
    render(<GuessWhoPage />);
    fireEvent.click(screen.getByTestId("guess-who-submit-button"));
    expect(mockSubmitGuess).toHaveBeenCalled();
  });

  it("shows the wrong-guess banner", () => {
    controllerState = baseController({
      started: true,
      clue: "Clue 2",
      lastEvent: { type: "wrong", clue: "Clue 2", clueNumber: 2, totalClues: 5 },
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-event-wrong")).toBeInTheDocument();
  });

  it("shows the reveal banner with Continue on a correct guess", () => {
    controllerState = baseController({
      started: true,
      lastEvent: {
        type: "correct",
        revealedName: "Cleopatra",
        avatarUrl: "https://example.com/c.png",
        gender: "female",
        streak: 3,
      },
    });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-reveal-banner")).toHaveTextContent("Cleopatra");
    fireEvent.click(screen.getByTestId("guess-who-continue-button"));
    expect(mockContinueRound).toHaveBeenCalled();
  });

  it("shows the game-over screen with a Play Again button", () => {
    controllerState = baseController({
      started: false,
      lastEvent: { type: "gameover", revealedName: "Cleopatra", finalStreak: 4 },
    });
    render(<GuessWhoPage />);
    expect(screen.getByText("Game Over")).toBeInTheDocument();
    expect(screen.getByTestId("guess-who-play-again-button")).toBeInTheDocument();
  });

  it("opens the give-up confirmation and confirms it", () => {
    controllerState = baseController({ started: true, clue: "Clue 1" });
    render(<GuessWhoPage />);
    fireEvent.click(screen.getByTestId("guess-who-give-up-link"));
    expect(screen.getByText("Give up this round?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Yes, give up"));
    expect(mockGiveUp).toHaveBeenCalledWith(true);
  });

  it("shows an error banner", () => {
    controllerState = baseController({ started: true, clue: "Clue 1", error: "Something broke" });
    render(<GuessWhoPage />);
    expect(screen.getByTestId("guess-who-error")).toHaveTextContent("Something broke");
  });
});

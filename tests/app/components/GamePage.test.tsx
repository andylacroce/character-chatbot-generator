import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { GAME_MYSTERY_NAME, GUESS_WHO, GUESS_WHO_NEXT } from "character-chatbot-shared";
import GamePage from "../../../src/app/components/GamePage";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../../src/app/components/LeaderboardClaim", () => ({
  __esModule: true,
  default: () => null,
}));

// GamePage folds useAccountMenu's items (identity label, change name, sign in/out, admin)
// into its own menu; default to unauthenticated so those assertions are unaffected by
// account-persistence behavior.
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

jest.mock("../../../src/app/components/useGameController", () => ({
  useGameController: () => controllerState,
}));

describe.each([GUESS_WHO, GUESS_WHO_NEXT])("GamePage ($title)", (game) => {
  const { copy } = game;
  // Who the header shows mid-run: the mystery placeholder, or the named chat partner.
  const speaker = game.hidesSpeaker
    ? { name: GAME_MYSTERY_NAME, avatarUrl: "/silhouette.svg", gender: null }
    : { name: "Sherlock Holmes", avatarUrl: "/sherlock.png", gender: "male" };

  function baseController(overrides: Record<string, unknown> = {}) {
    const state = {
      started: false,
      starting: false,
      speaker,
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
      ...overrides,
    };
    // Mirrors useGameSession: a just-won streak shows while awaiting Continue.
    const lastEvent = state.lastEvent as { type: string; streak?: number } | null;
    return {
      ...state,
      displayedStreak: lastEvent?.type === "correct" ? lastEvent.streak : state.streak,
    };
  }

  /** A mid-run controller state, `started` by default. */
  const running = (overrides: Record<string, unknown> = {}) =>
    baseController({
      started: true,
      messages: [{ sender: speaker.name, text: "Greetings." }],
      ...overrides,
    });

  const correct = { type: "correct", revealedName: "Irene Adler", streak: 1 };
  const renderPage = () => render(<GamePage gameId={game.id} />);

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    controllerState = baseController();
  });

  describe("start and game-over screens", () => {
    it("renders this game's start screen before a run begins", () => {
      renderPage();
      expect(screen.getByText(copy.screen.headline)).toBeInTheDocument();
      expect(screen.getByTestId("game-start-button")).toBeInTheDocument();
    });

    it("calls startGame when Start Game is clicked", () => {
      renderPage();
      fireEvent.click(screen.getByTestId("game-start-button"));
      expect(mockStartGame).toHaveBeenCalled();
    });

    it("shows staged progress while starting", () => {
      controllerState = baseController({
        starting: true,
        startProgressMessage: "Generating portrait…",
      });
      renderPage();
      expect(screen.getByTestId("game-start-progress")).toBeInTheDocument();
      expect(screen.getByText("Generating portrait…")).toBeInTheDocument();
      expect(screen.getByTestId("game-start-button")).toBeDisabled();
    });

    it("shows the game-over screen with the reveal, Play Again, and a leaderboard link", () => {
      controllerState = baseController({
        lastEvent: { type: "gameover", revealedName: "Edmund Ironside", finalStreak: 3 },
      });
      renderPage();
      expect(screen.getByText(copy.screen.gameOverHeadline)).toBeInTheDocument();
      expect(
        screen.getByText(
          copy.screen.gameOverSubhead.replace("{name}", "Edmund Ironside").replace("{streak}", "3"),
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId("game-play-again-button")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: copy.screen.leaderboardLabel }));
      expect(mockPush).toHaveBeenCalledWith("/leaderboard");
    });
  });

  describe("the running chat", () => {
    it("renders the chat shell under the speaker's name with the streak badge", () => {
      controllerState = running({ streak: 2 });
      renderPage();
      expect(screen.getAllByText(speaker.name).length).toBeGreaterThan(0);
      expect(screen.getByText("Greetings.")).toBeInTheDocument();
      expect(screen.getByTestId("game-streak-badge")).toHaveTextContent("Streak: 2");
    });

    it("shows the visitor's own preferred name on their messages instead of the generic 'Me'", () => {
      // Regression test: the page never wired useAccountMenu's userNameCtx into ChatShell,
      // so the player's own messages always fell back to "Me" in the game, even though
      // ordinary chat already shows the visitor's real preferred name.
      localStorage.setItem("chatbot-user-name", "Andy");
      controllerState = running({
        messages: [
          { sender: speaker.name, text: "Greetings." },
          { sender: "User", text: "Hello!" },
        ],
      });
      renderPage();
      expect(screen.getByText("Andy")).toBeInTheDocument();
      expect(screen.queryByText("Me")).not.toBeInTheDocument();
    });

    it("shows the personal best next to the streak when the player has one", () => {
      controllerState = running({ streak: 2, highScore: 5 });
      renderPage();
      expect(screen.getByTestId("game-high-score-badge")).toHaveTextContent("Best: 5");
    });

    it("hides the personal best badge when there is none on record", () => {
      controllerState = running({ streak: 2, highScore: null });
      renderPage();
      expect(screen.queryByTestId("game-high-score-badge")).not.toBeInTheDocument();
    });

    it("shows the wrong-guess banner", () => {
      controllerState = running({ lastEvent: { type: "wrong", wrongGuessesRemaining: 1 } });
      renderPage();
      expect(screen.getByTestId("game-event-wrong")).toBeInTheDocument();
    });
  });

  describe("menu", () => {
    it("ends the run when Back to Home is clicked", () => {
      controllerState = running();
      renderPage();
      fireEvent.click(screen.getByLabelText(/open menu/i));
      fireEvent.click(screen.getByText("Back to Home"));
      expect(mockQuitGame).toHaveBeenCalled();
    });

    it("shows a confirmation before giving up, and only calls giveUp once confirmed", () => {
      controllerState = running();
      renderPage();
      fireEvent.click(screen.getByLabelText(/open menu/i));
      fireEvent.click(screen.getByText("Give Up"));
      expect(screen.getByText(copy.giveUpConfirm.title)).toBeInTheDocument();
      expect(mockGiveUp).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText(copy.giveUpConfirm.confirmLabel));
      expect(mockGiveUp).toHaveBeenCalledWith(true);
    });

    it("cancels the give-up confirmation without calling giveUp", () => {
      controllerState = running();
      renderPage();
      fireEvent.click(screen.getByLabelText(/open menu/i));
      fireEvent.click(screen.getByText("Give Up"));
      fireEvent.click(screen.getByText(copy.giveUpConfirm.cancelLabel));
      expect(screen.queryByText(copy.giveUpConfirm.title)).not.toBeInTheDocument();
      expect(mockGiveUp).not.toHaveBeenCalled();
    });

    it("opens the give-up confirmation when the server detects a give-up typed in chat", () => {
      controllerState = running({ giveUpRequested: true });
      renderPage();
      expect(screen.getByText(copy.giveUpConfirm.title)).toBeInTheDocument();
      expect(mockClearGiveUpRequest).toHaveBeenCalled();
    });
  });

  describe("how-to-play", () => {
    it("shows this game's instructions automatically on a visitor's first visit", () => {
      controllerState = running();
      renderPage();
      expect(screen.getByText(copy.instructions.title)).toBeInTheDocument();
    });

    it("does not show them again once seen, but the menu reopens them", () => {
      localStorage.setItem(game.storageKeys.instructionsSeen, "true");
      controllerState = running();
      renderPage();
      expect(screen.queryByText(copy.instructions.title)).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText(/open menu/i));
      fireEvent.click(screen.getByText("How to Play"));
      expect(screen.getByText(copy.instructions.title)).toBeInTheDocument();
    });

    it("remembers a dismissal under this game's own storage key", () => {
      controllerState = running();
      renderPage();
      fireEvent.click(screen.getByText(copy.instructions.closeLabel));
      expect(localStorage.getItem(game.storageKeys.instructionsSeen)).toBe("true");
    });
  });

  describe("a correct guess and Continue", () => {
    it("shows the correct-guess banner, then a Continue button that advances the run", () => {
      // awaitingContinue is always derived from lastEvent in the real hook (they can't
      // disagree), so this mocked state sets both to match that invariant.
      controllerState = running({ lastEvent: correct, awaitingContinue: true });
      renderPage();
      expect(screen.getByTestId("game-event-correct")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("game-continue-button"));
      expect(mockContinueRound).toHaveBeenCalled();
    });

    it("shows a staged progress spinner while the next round is generating, instead of the banner", () => {
      controllerState = running({
        lastEvent: null,
        continuing: true,
        continueProgressMessage: "Generating portrait…",
      });
      renderPage();
      expect(screen.getByTestId("game-continue-progress")).toHaveTextContent(
        "Generating portrait…",
      );
      expect(screen.queryByTestId("game-event-correct")).not.toBeInTheDocument();
      expect(screen.getByTestId("chat-input")).toBeDisabled();
    });

    it("shows the new streak in the header badge while the banner is up, not the stale value", () => {
      // Regression test: `streak` state itself is held back until Continue is clicked, but
      // the banner already shows the new streak; the header used to keep showing the old
      // number right underneath it.
      controllerState = running({ streak: 0, lastEvent: correct, awaitingContinue: true });
      renderPage();
      expect(screen.getByTestId("game-streak-badge")).toHaveTextContent("Streak: 1");
    });

    it("disables the chat input while awaiting the round switch", () => {
      controllerState = running({ lastEvent: correct, awaitingContinue: true });
      renderPage();
      expect(screen.getByTestId("chat-input")).toBeDisabled();
    });
  });

  if (game.hidesSpeaker) {
    it("reveals the real name once the guess is correct, in place of the mystery placeholder", () => {
      controllerState = running({
        speaker: {
          name: "Irene Adler",
          avatarUrl: "https://example.com/irene.png",
          gender: "female",
        },
        messages: [{ sender: "Irene Adler", text: "Yes, that's me!" }],
        lastEvent: correct,
        awaitingContinue: true,
      });
      renderPage();
      expect(screen.getAllByText("Irene Adler").length).toBeGreaterThan(0);
      expect(screen.queryByText(GAME_MYSTERY_NAME)).not.toBeInTheDocument();
    });
  }
});

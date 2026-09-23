import { renderHook, act, waitFor } from "@testing-library/react";
import {
  mockResponse,
  mockSseResponse,
  mockControlledSseResponse,
} from "../../helpers/mockResponse";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockAuthenticatedFetch = jest.fn();
const mockHighScoreFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) =>
    args[0] === "/api/game/high-score"
      ? mockHighScoreFetch(...(args as unknown[]))
      : mockAuthenticatedFetch(...(args as unknown[])),
}));

const mockLogEvent = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
  sanitizeLogMeta: (meta: unknown) => meta,
}));

const mockPlayAudio = jest.fn();
const mockStopAudio = jest.fn();
const mockIsAudioPlaying = jest.fn();
const mockAudioRef = { current: { muted: false } } as unknown as React.RefObject<HTMLAudioElement>;
jest.mock("../../../app/components/useAudioPlayer", () => ({
  useAudioPlayer: (..._args: unknown[]) => ({
    playAudio: mockPlayAudio,
    stopAudio: mockStopAudio,
    isAudioPlaying: mockIsAudioPlaying,
    audioRef: mockAudioRef,
  }),
}));

jest.mock("../../../src/utils/storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getJSON: jest.fn(),
  setJSON: jest.fn(),
}));

import { useGameController } from "../../../app/components/useGameController";
import * as storage from "../../../src/utils/storage";

const mockStorage = storage as unknown as jest.Mocked<{
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  getJSON: jest.Mock;
  setJSON: jest.Mock;
}>;

/** A fully-populated /api/game/start or /api/game/continue streamed success frame. */
function roundFrame(overrides: Record<string, unknown> = {}) {
  return {
    gameToken: "token-1",
    currentCharacterName: "Sherlock Holmes",
    avatarUrl: "https://example.com/sherlock.png",
    gender: "male",
    reply: "Greetings, detective.",
    audioFileUrl: "/api/audio?file=intro.mp3",
    streak: 0,
    done: true,
    ...overrides,
  };
}

describe("useGameController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    mockStorage.getItem.mockReturnValue(null);
    mockStorage.getJSON.mockReturnValue(null);
    mockPlayAudio.mockResolvedValue(undefined);
    mockHighScoreFetch.mockResolvedValue(mockResponse({ highScore: null }));
  });

  it("starts with no active run when nothing is persisted", () => {
    const { result } = renderHook(() => useGameController());
    expect(result.current.started).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it("replays a past character message through the shared audio player", async () => {
    const { result } = renderHook(() => useGameController());
    const message = {
      sender: "Sherlock Holmes",
      text: "The game is afoot.",
      audioFileUrl: "/api/audio?file=sherlock.mp3",
    };

    mockPlayAudio.mockClear();
    await act(async () => {
      await result.current.replayMessageAudio(message);
    });

    expect(mockPlayAudio).toHaveBeenCalledWith(message.audioFileUrl);
  });

  it("hydrates an in-progress run from localStorage on mount", () => {
    mockStorage.getItem.mockImplementation((key: string) =>
      key === "chatbot-game-token" ? "persisted-token" : null,
    );
    mockStorage.getJSON.mockReturnValue({
      currentCharacterName: "Sherlock Holmes",
      avatarUrl: "https://example.com/sherlock.png",
      gender: "male",
      streak: 2,
      messages: [{ sender: "Sherlock Holmes", text: "Hello" }],
      roundStartIndex: 0,
    });

    const { result } = renderHook(() => useGameController());
    expect(result.current.started).toBe(true);
    expect(result.current.currentCharacterName).toBe("Sherlock Holmes");
    expect(result.current.streak).toBe(2);
    expect(result.current.messages).toHaveLength(1);
  });

  it("restores the correct-guess banner on reload instead of silently discarding it", () => {
    // Regression test for a real bug found via manual testing: reloading the page while
    // the "Continue" banner was up used to lose all sign the guess had ever registered.
    // The current design makes this simpler to get right than it used to be: the next
    // character isn't generated until Continue is actually clicked (see continueRound),
    // so there's no separate "held-back round data" to lose on reload — the existing
    // gameToken/currentCharacterName/streak are the ordinary pre-switch values already
    // covered by normal persistence; only the transient `lastEvent` banner needs its own
    // persistence to reappear identically after a reload.
    mockStorage.getItem.mockImplementation((key: string) =>
      key === "chatbot-game-token" ? "persisted-token" : null,
    );
    mockStorage.getJSON.mockReturnValue({
      currentCharacterName: "Jim Hawkins",
      avatarUrl: "https://example.com/jim.png",
      gender: "male",
      streak: 0,
      messages: [{ sender: "Jim Hawkins", text: "Aye, that's her! Electra it is!" }],
      roundStartIndex: 0,
      lastEvent: { type: "correct", revealedName: "Electra", streak: 1 },
    });

    const { result } = renderHook(() => useGameController());

    expect(result.current.awaitingContinue).toBe(true);
    expect(result.current.lastEvent).toEqual({
      type: "correct",
      revealedName: "Electra",
      streak: 1,
    });
    // The next character genuinely hasn't been generated yet — identity stays whatever
    // it was before the guess until continueRound() actually runs.
    expect(result.current.currentCharacterName).toBe("Jim Hawkins");
    expect(result.current.gameToken).toBe("persisted-token");
  });

  it("persists the correct-guess banner so it survives a reload", async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));
    const { result } = renderHook(() => useGameController());
    await act(async () => {
      await result.current.startGame();
    });

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Aye, that's her!",
        correct: true,
        revealedName: "Electra",
        streak: 1,
      }),
    );
    act(() => result.current.setInput("Electra"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(mockStorage.setJSON).toHaveBeenLastCalledWith(
      "chatbot-game-transcript",
      expect.objectContaining({
        lastEvent: { type: "correct", revealedName: "Electra", streak: 1 },
      }),
    );
    // `streak` itself waits for Continue, but the displayed streak already shows the win.
    expect(result.current.streak).toBe(0);
    expect(result.current.displayedStreak).toBe(1);
  });

  it("fetches a cookie-bound personal best for a guest", async () => {
    const { result } = renderHook(() => useGameController());
    await waitFor(() => expect(result.current.highScore).toBeNull());
    expect(mockHighScoreFetch).toHaveBeenCalledWith("/api/game/high-score");
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it("fetches the signed-in user's personal best on mount", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockHighScoreFetch.mockResolvedValueOnce(mockResponse({ highScore: 5 }));

    const { result } = renderHook(() => useGameController());

    await waitFor(() => expect(result.current.highScore).toBe(5));
    expect(mockHighScoreFetch).toHaveBeenCalledWith("/api/game/high-score");
  });

  it("keeps the personal best null for a signed-in user who has never beaten a streak", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockHighScoreFetch.mockResolvedValueOnce(mockResponse({ highScore: null }));

    const { result } = renderHook(() => useGameController());

    await waitFor(() => expect(mockHighScoreFetch).toHaveBeenCalled());
    expect(result.current.highScore).toBeNull();
  });

  it("logs (without crashing) when the personal-best fetch fails", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockHighScoreFetch.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useGameController());

    await waitFor(() =>
      expect(mockLogEvent).toHaveBeenCalledWith(
        "warn",
        "game_high_score_fetch_failed",
        expect.any(String),
        expect.anything(),
      ),
    );
    expect(result.current.highScore).toBeNull();
  });

  it("startGame begins a new run on success", async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));

    const { result } = renderHook(() => useGameController());
    await act(async () => {
      await result.current.startGame();
    });

    expect(result.current.started).toBe(true);
    expect(result.current.currentCharacterName).toBe("Sherlock Holmes");
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toBe("Greetings, detective.");
    expect(result.current.starting).toBe(false);
  });

  it("startGame's progress reflects real server-reported stages and holds on the final one until the last frame arrives", async () => {
    // Regression coverage for the switch from a blind client-side timer (which could
    // show a stage no longer actually happening) to real, server-reported progress.
    const stream = mockControlledSseResponse();
    mockAuthenticatedFetch.mockResolvedValueOnce(stream.response);

    const { result } = renderHook(() => useGameController());
    let startPromise!: Promise<void>;
    act(() => {
      startPromise = result.current.startGame();
    });

    expect(result.current.startProgressMessage).toBe("Creating personality…");

    await act(async () => {
      stream.push({ stage: "avatar", done: false });
      await Promise.resolve();
    });
    // Personality is still outstanding, so the label stays on it — it never jumps ahead
    // just because avatar happened to finish first.
    expect(result.current.startProgressMessage).toBe("Creating personality…");

    await act(async () => {
      stream.push({ stage: "personality", done: false });
      await Promise.resolve();
    });
    expect(result.current.startProgressMessage).toBe("Writing opening line…");

    await act(async () => {
      stream.push({ stage: "voice", done: false });
      await Promise.resolve();
    });
    expect(result.current.startProgressMessage).toBe("Writing opening line…");

    await act(async () => {
      stream.push({ stage: "reply", done: false });
      await Promise.resolve();
    });
    // Both phases are done, but the final frame (real TTS synthesis) hasn't arrived —
    // holds here rather than looping back or going blank.
    expect(result.current.startProgressMessage).toBe("Preparing greeting…");

    await act(async () => {
      stream.push(roundFrame());
      stream.finish();
      await startPromise;
    });

    expect(result.current.started).toBe(true);
    expect(result.current.startProgressMessage).toBe("Starting…");
  });

  it("startGame sets an error and stays unstarted on failure", async () => {
    mockAuthenticatedFetch.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useGameController());
    await act(async () => {
      await result.current.startGame();
    });

    expect(result.current.started).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_client_start_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  async function startedHook() {
    mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));
    const rendered = renderHook(() => useGameController());
    await act(async () => {
      await rendered.result.current.startGame();
    });
    return rendered;
  }

  it("logs an error when audio playback fails with a non-abort error", async () => {
    mockPlayAudio.mockRejectedValueOnce(new Error("playback failed"));
    await startedHook();

    await waitFor(() =>
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        "game_audio_playback_error",
        "Audio playback failed",
        expect.anything(),
      ),
    );
  });

  it("logs info (not error) when audio playback is aborted", async () => {
    const abortErr = new Error("aborted");
    (abortErr as unknown as { name?: string }).name = "AbortError";
    mockPlayAudio.mockRejectedValueOnce(abortErr);
    await startedHook();

    await waitFor(() =>
      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "game_audio_playback_aborted",
        "Audio playback aborted",
      ),
    );
  });

  it("sendMessage appends an ordinary reply without changing the token", async () => {
    const { result } = await startedHook();

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({ reply: "I've solved many cases." }),
    );

    act(() => result.current.setInput("What's your favorite case?"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.messages.some((m) => m.text === "I've solved many cases.")).toBe(true);
    expect(result.current.gameToken).toBe("token-1");
    expect(result.current.lastEvent).toBeNull();
  });

  it("sendMessage sets giveUpRequested when the server detects a give-up request, without appending a reply", async () => {
    const { result } = await startedHook();

    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ giveUpRequested: true }));

    act(() => result.current.setInput("I give up"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.giveUpRequested).toBe(true);
    // The player's own message is still shown, but no bot reply is appended for this turn.
    expect(result.current.messages.some((m) => m.text === "I give up")).toBe(true);
    expect(result.current.messages).toHaveLength(2);

    act(() => result.current.clearGiveUpRequest());
    expect(result.current.giveUpRequested).toBe(false);
  });

  it("sendMessage judges a correct guess without generating the next round, then continueRound generates and applies it", async () => {
    const { result } = await startedHook();

    // Judging the guess is deliberately fast and carries no round-switch data — see
    // pages/api/game/message.ts's doc comment.
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Brilliant, you got it!",
        audioFileUrl: "/api/audio?file=reaction.mp3",
        correct: true,
        gameOver: false,
        gameToken: "judged-token",
        revealedName: "Irene Adler",
        streak: 1,
      }),
    );

    act(() => result.current.setInput("It's Irene Adler!"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.lastEvent).toEqual({
      type: "correct",
      revealedName: "Irene Adler",
      streak: 1,
    });
    expect(result.current.awaitingContinue).toBe(true);
    // Nothing about the next character has been generated or applied yet.
    expect(result.current.currentCharacterName).toBe("Sherlock Holmes");
    expect(result.current.gameToken).toBe("judged-token");
    expect(result.current.streak).toBe(0);
    expect(result.current.messages.some((m) => m.text === "Brilliant, you got it!")).toBe(true);
    expect(result.current.messages.some((m) => m.text === "Hello, dear player.")).toBe(false);

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockSseResponse([
        roundFrame({
          gameToken: "token-2",
          currentCharacterName: "Irene Adler",
          avatarUrl: "https://example.com/adler.png",
          gender: "female",
          reply: "Hello, dear player.",
          audioFileUrl: "/api/audio?file=opening.mp3",
          streak: 1,
        }),
      ]),
    );
    await act(async () => {
      await result.current.continueRound();
    });

    expect(mockAuthenticatedFetch).toHaveBeenLastCalledWith(
      "/api/game/continue",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ gameToken: "judged-token", stream: true }),
      }),
    );
    expect(result.current.awaitingContinue).toBe(false);
    expect(result.current.currentCharacterName).toBe("Irene Adler");
    expect(result.current.gameToken).toBe("token-2");
    expect(result.current.streak).toBe(1);
    expect(result.current.messages.some((m) => m.text === "Hello, dear player.")).toBe(true);
  });

  it("continueRound restores the correct-guess banner and reports an error on failure, so the player can retry", async () => {
    const { result } = await startedHook();

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Brilliant, you got it!",
        correct: true,
        gameOver: false,
        revealedName: "Irene Adler",
        streak: 1,
      }),
    );
    act(() => result.current.setInput("It's Irene Adler!"));
    await act(async () => {
      await result.current.sendMessage();
    });

    mockAuthenticatedFetch.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      await result.current.continueRound();
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.awaitingContinue).toBe(true);
    expect(result.current.lastEvent).toEqual({
      type: "correct",
      revealedName: "Irene Adler",
      streak: 1,
    });
    expect(result.current.currentCharacterName).toBe("Sherlock Holmes");
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_client_continue_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  it("sendMessage bumps the personal best optimistically for a signed-in player on a correct guess", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    // Mount fetches the personal best first, then startGame is invoked explicitly —
    // the mocked responses must be queued in that same order.
    mockHighScoreFetch.mockResolvedValueOnce(mockResponse({ highScore: 2 }));
    mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));

    const { result } = renderHook(() => useGameController());
    await waitFor(() => expect(result.current.highScore).toBe(2));
    await act(async () => {
      await result.current.startGame();
    });

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Brilliant, you got it!",
        correct: true,
        gameOver: false,
        revealedName: "Irene Adler",
        streak: 3,
      }),
    );

    act(() => result.current.setInput("It's Irene Adler!"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.highScore).toBe(3);
  });

  it("never touches the personal best for a guest on a correct guess", async () => {
    const { result } = await startedHook();

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Brilliant, you got it!",
        correct: true,
        gameOver: false,
        revealedName: "Irene Adler",
        streak: 1,
      }),
    );

    act(() => result.current.setInput("It's Irene Adler!"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.highScore).toBe(1);
  });

  it("sendMessage excludes prior rounds' trailing messages from the next round's server-side history", async () => {
    // Regression test: roundStartIndex must be computed from the FULL messages array
    // length at the moment continueRound actually runs, not from the current round's
    // slice length — otherwise a round switch from round 2 onward leaks the prior
    // round's tail (its own Q&A, guess, and reaction) into the next round's
    // conversationHistory. This only coincided with correct behavior on the very first
    // round switch (round 1 -> 2), since roundStartIndex started at 0 there.
    const { result } = await startedHook();

    // Round 1: one ordinary exchange.
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({ reply: "I've solved many cases." }),
    );
    act(() => result.current.setInput("What's your favorite case?"));
    await act(async () => {
      await result.current.sendMessage();
    });

    // Round 1 -> 2: correct guess, then Continue.
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Brilliant, you got it!",
        correct: true,
        gameOver: false,
        revealedName: "Irene Adler",
        streak: 1,
      }),
    );
    act(() => result.current.setInput("It's Irene Adler!"));
    await act(async () => {
      await result.current.sendMessage();
    });
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockSseResponse([
        roundFrame({
          gameToken: "token-2",
          currentCharacterName: "Irene Adler",
          reply: "Hello, dear player.",
          streak: 1,
        }),
      ]),
    );
    await act(async () => {
      await result.current.continueRound();
    });

    // Round 2: one ordinary exchange.
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Ask away, darling." }));
    act(() => result.current.setInput("Tell me about yourself"));
    await act(async () => {
      await result.current.sendMessage();
    });

    // Round 2 -> 3: correct guess again, then Continue.
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Yes, exactly!",
        correct: true,
        gameOver: false,
        revealedName: "Watson",
        streak: 2,
      }),
    );
    act(() => result.current.setInput("It's Watson!"));
    await act(async () => {
      await result.current.sendMessage();
    });
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockSseResponse([
        roundFrame({
          gameToken: "token-3",
          currentCharacterName: "Watson",
          reply: "Greetings once more.",
          streak: 2,
        }),
      ]),
    );
    await act(async () => {
      await result.current.continueRound();
    });

    // Round 3: one ordinary exchange — its conversationHistory must contain ONLY
    // round 3's own greeting, never round 1/2's leftover Q&A/guess/reaction.
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Elementary, my dear." }));
    act(() => result.current.setInput("Anything to add, Watson?"));
    await act(async () => {
      await result.current.sendMessage();
    });

    const lastCall =
      mockAuthenticatedFetch.mock.calls[mockAuthenticatedFetch.mock.calls.length - 1];
    const lastBody = JSON.parse(lastCall[1].body);
    expect(lastBody.conversationHistory).toEqual(["Bot: Greetings once more."]);
  });

  it("sendMessage tolerates a first wrong guess and keeps the run going", async () => {
    const { result } = await startedHook();

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Not quite, try again?",
        correct: false,
        gameOver: false,
        wrongGuessesRemaining: 1,
        gameToken: "token-1-wrong",
      }),
    );

    act(() => result.current.setInput("Is it Moriarty?"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.lastEvent).toEqual({ type: "wrong", wrongGuessesRemaining: 1 });
    expect(result.current.gameToken).toBe("token-1-wrong");
    expect(result.current.started).toBe(true);
  });

  it("sendMessage ends the run on a second wrong guess", async () => {
    const { result } = await startedHook();

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Alas, it was Irene Adler.",
        correct: false,
        gameOver: true,
        revealedName: "Irene Adler",
        finalStreak: 0,
      }),
    );

    act(() => result.current.setInput("Is it Moriarty?"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.lastEvent).toEqual({
      type: "gameover",
      revealedName: "Irene Adler",
      finalStreak: 0,
    });
    expect(result.current.started).toBe(false);
  });

  it("sendMessage does nothing when input is empty", async () => {
    const { result } = await startedHook();
    const callsBefore = mockAuthenticatedFetch.mock.calls.length;

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(mockAuthenticatedFetch.mock.calls.length).toBe(callsBefore);
  });

  it("sendMessage sets an error on API failure", async () => {
    const { result } = await startedHook();
    mockAuthenticatedFetch.mockRejectedValueOnce(new Error("boom"));

    act(() => result.current.setInput("hello"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.error).toBeTruthy();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_client_message_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  it("handleKeyDown triggers sendMessage on Enter", async () => {
    const { result } = await startedHook();
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "OK" }));

    act(() => result.current.setInput("Hello there"));
    act(() => result.current.handleKeyDown({ key: "Enter" } as unknown as React.KeyboardEvent));

    await waitFor(() => expect(result.current.messages.some((m) => m.text === "OK")).toBe(true));
  });

  it("quitGame clears all game state and stops audio", async () => {
    const { result } = await startedHook();

    act(() => result.current.quitGame());

    expect(result.current.started).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.streak).toBe(0);
    expect(mockStopAudio).toHaveBeenCalled();
  });

  it("giveUp does nothing until confirmed", async () => {
    const { result } = await startedHook();
    const callsBefore = mockAuthenticatedFetch.mock.calls.length;

    await act(async () => {
      await result.current.giveUp(false);
    });

    expect(mockAuthenticatedFetch.mock.calls.length).toBe(callsBefore);
    expect(result.current.started).toBe(true);
  });

  it("giveUp reveals the hidden name and ends the run once confirmed", async () => {
    const { result } = await startedHook();
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({ revealedName: "Irene Adler", finalStreak: 0 }),
    );

    await act(async () => {
      await result.current.giveUp(true);
    });

    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      "/api/game/give-up",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.current.lastEvent).toEqual({
      type: "gameover",
      revealedName: "Irene Adler",
      finalStreak: 0,
    });
    expect(result.current.started).toBe(false);
  });

  it("giveUp sets an error when the request fails", async () => {
    const { result } = await startedHook();
    mockAuthenticatedFetch.mockRejectedValueOnce(new Error("network down"));

    await act(async () => {
      await result.current.giveUp(true);
    });

    expect(result.current.error).toBeTruthy();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "game_client_give_up_failed",
      expect.any(String),
      expect.anything(),
    );
  });
});

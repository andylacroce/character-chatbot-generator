import { renderHook, act, waitFor } from "@testing-library/react";
import { mockResponse } from "../../helpers/mockResponse";

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
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

describe("useGameController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getItem.mockReturnValue(null);
    mockStorage.getJSON.mockReturnValue(null);
    mockPlayAudio.mockResolvedValue(undefined);
  });

  it("starts with no active run when nothing is persisted", () => {
    const { result } = renderHook(() => useGameController());
    expect(result.current.started).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it("hydrates an in-progress run from localStorage on mount", () => {
    mockStorage.getItem.mockImplementation((key: string) =>
      key === "chatbot-game-token" ? "persisted-token" : null,
    );
    mockStorage.getJSON.mockReturnValue({
      currentCharacterName: "Sherlock Holmes",
      avatarUrl: "https://example.com/sherlock.png",
      voiceGender: "male",
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

  it("startGame begins a new run on success", async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        gameToken: "new-token",
        currentCharacterName: "Sherlock Holmes",
        avatarUrl: "https://example.com/sherlock.png",
        voiceGender: "male",
        reply: "Greetings, detective.",
        audioFileUrl: "/api/audio?file=intro.mp3",
        streak: 0,
      }),
    );

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

  it("startGame's staged progress holds on the last stage instead of looping back to the first", async () => {
    jest.useFakeTimers();
    let resolveFetch: (value: unknown) => void;
    mockAuthenticatedFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { result } = renderHook(() => useGameController());
    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.startGame();
    });

    // Advance well past a full pass through all four stages (4 * 600ms) — the message
    // must hold on the last stage rather than wrapping back around to the first, which is
    // exactly the "looping spinner" regression this test guards against.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.startProgressMessage).toBe("Preparing greeting…");

    resolveFetch!(
      mockResponse({
        gameToken: "token",
        currentCharacterName: "Sherlock Holmes",
        reply: "Hello.",
        streak: 0,
      }),
    );
    await act(async () => {
      await startPromise;
    });

    jest.useRealTimers();
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
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        gameToken: "token-1",
        currentCharacterName: "Sherlock Holmes",
        avatarUrl: "https://example.com/sherlock.png",
        voiceGender: "male",
        reply: "Greetings, detective.",
        audioFileUrl: "/api/audio?file=intro.mp3",
        streak: 0,
      }),
    );
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

  it("sendMessage advances the round and updates state on a correct guess", async () => {
    const { result } = await startedHook();

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Brilliant, you got it!",
        audioFileUrl: "/api/audio?file=reaction.mp3",
        nextReply: "Hello, dear player.",
        nextAudioFileUrl: "/api/audio?file=opening.mp3",
        correct: true,
        gameOver: false,
        revealedName: "Irene Adler",
        currentCharacterName: "Irene Adler",
        streak: 1,
        gameToken: "token-2",
        avatarUrl: "https://example.com/adler.png",
        voiceGender: "female",
      }),
    );

    act(() => result.current.setInput("It's Irene Adler!"));
    await act(async () => {
      await result.current.sendMessage();
    });

    // The round switch itself is held back until the player clicks Continue: only the
    // reaction message and the "correct" event are applied immediately.
    expect(result.current.lastEvent).toEqual({
      type: "correct",
      revealedName: "Irene Adler",
      streak: 1,
    });
    expect(result.current.awaitingContinue).toBe(true);
    expect(result.current.currentCharacterName).toBe("Sherlock Holmes");
    expect(result.current.gameToken).toBe("token-1");
    expect(result.current.streak).toBe(0);
    expect(result.current.messages.some((m) => m.text === "Brilliant, you got it!")).toBe(true);
    expect(result.current.messages.some((m) => m.text === "Hello, dear player.")).toBe(false);

    act(() => result.current.continueRound());

    expect(result.current.awaitingContinue).toBe(false);
    expect(result.current.currentCharacterName).toBe("Irene Adler");
    expect(result.current.gameToken).toBe("token-2");
    expect(result.current.streak).toBe(1);
    expect(result.current.messages.some((m) => m.text === "Hello, dear player.")).toBe(true);
  });

  it("sendMessage excludes prior rounds' trailing messages from the next round's server-side history", async () => {
    // Regression test: roundStartIndex must be computed from the FULL messages array
    // length, not from the current round's slice length — otherwise a round switch
    // from round 2 onward leaks the prior round's tail (its own Q&A, guess, and
    // reaction) into the next round's conversationHistory. This only coincided with
    // correct behavior on the very first round switch (round 1 -> 2), since
    // roundStartIndex started at 0 there.
    const { result } = await startedHook();

    // Round 1: one ordinary exchange.
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({ reply: "I've solved many cases." }),
    );
    act(() => result.current.setInput("What's your favorite case?"));
    await act(async () => {
      await result.current.sendMessage();
    });

    // Round 1 -> 2: correct guess.
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Brilliant, you got it!",
        nextReply: "Hello, dear player.",
        correct: true,
        gameOver: false,
        revealedName: "Irene Adler",
        currentCharacterName: "Irene Adler",
        streak: 1,
        gameToken: "token-2",
      }),
    );
    act(() => result.current.setInput("It's Irene Adler!"));
    await act(async () => {
      await result.current.sendMessage();
    });
    act(() => result.current.continueRound());

    // Round 2: one ordinary exchange.
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Ask away, darling." }));
    act(() => result.current.setInput("Tell me about yourself"));
    await act(async () => {
      await result.current.sendMessage();
    });

    // Round 2 -> 3: correct guess again.
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Yes, exactly!",
        nextReply: "Greetings once more.",
        correct: true,
        gameOver: false,
        revealedName: "Watson",
        currentCharacterName: "Watson",
        streak: 2,
        gameToken: "token-3",
      }),
    );
    act(() => result.current.setInput("It's Watson!"));
    await act(async () => {
      await result.current.sendMessage();
    });
    act(() => result.current.continueRound());

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

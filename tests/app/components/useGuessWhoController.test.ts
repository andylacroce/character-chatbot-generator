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
    args[0] === "/api/guess-who/high-score"
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
jest.mock("../../../src/app/components/useAudioPlayer", () => ({
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

// Mock the hook itself (not the browser API a second time) — same rationale as
// useChatController.speech.test.ts/useGuessWhoNextController.speech.test.ts.
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

import { useGuessWhoController } from "../../../src/app/components/useGuessWhoController";
import * as storage from "../../../src/utils/storage";

const mockStorage = storage as unknown as jest.Mocked<{
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  getJSON: jest.Mock;
  setJSON: jest.Mock;
}>;

const MYSTERY_NAME = "???";

/** A fully-populated /api/guess-who/start or /api/guess-who/continue streamed success frame. */
function roundFrame(overrides: Record<string, unknown> = {}) {
  return {
    guessWhoToken: "token-1",
    reply: "Greetings, traveler. Ask me anything.",
    audioFileUrl: "/api/audio?file=intro.mp3",
    streak: 0,
    done: true,
    ...overrides,
  };
}

describe("useGuessWhoController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    mockStorage.getItem.mockReturnValue(null);
    mockStorage.getJSON.mockReturnValue(null);
    mockPlayAudio.mockResolvedValue(undefined);
    mockHighScoreFetch.mockResolvedValue(mockResponse({ highScore: null }));
    mockIsSupported = true;
    mockIsRecording = false;
    mockTranscript = "";
    mockSpeechError = null;
  });

  it("starts with no active run when nothing is persisted", () => {
    const { result } = renderHook(() => useGuessWhoController());
    expect(result.current.started).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it("hydrates an in-progress run from localStorage on mount", () => {
    mockStorage.getItem.mockImplementation((key: string) =>
      key === "chatbot-guess-who-token" ? "persisted-token" : null,
    );
    mockStorage.getJSON.mockReturnValue({
      streak: 2,
      messages: [{ sender: MYSTERY_NAME, text: "Hello" }],
      roundStartIndex: 0,
      lastEvent: null,
    });

    const { result } = renderHook(() => useGuessWhoController());
    expect(result.current.started).toBe(true);
    expect(result.current.streak).toBe(2);
    expect(result.current.messages).toHaveLength(1);
  });

  it("restores the correct-guess banner on reload instead of silently discarding it", () => {
    mockStorage.getItem.mockImplementation((key: string) =>
      key === "chatbot-guess-who-token" ? "persisted-token" : null,
    );
    mockStorage.getJSON.mockReturnValue({
      streak: 0,
      messages: [{ sender: MYSTERY_NAME, text: "Aye, that's me!" }],
      roundStartIndex: 0,
      lastEvent: {
        type: "correct",
        revealedName: "Electra",
        avatarUrl: "https://example.com/electra.png",
        gender: "female",
        streak: 1,
      },
    });

    const { result } = renderHook(() => useGuessWhoController());

    expect(result.current.awaitingContinue).toBe(true);
    expect(result.current.lastEvent).toEqual({
      type: "correct",
      revealedName: "Electra",
      avatarUrl: "https://example.com/electra.png",
      gender: "female",
      streak: 1,
    });
    expect(result.current.guessWhoToken).toBe("persisted-token");
  });

  it("fetches a cookie-bound personal best for a guest", async () => {
    const { result } = renderHook(() => useGuessWhoController());
    await waitFor(() => expect(result.current.highScore).toBeNull());
    expect(mockHighScoreFetch).toHaveBeenCalledWith("/api/guess-who/high-score");
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it("fetches the signed-in user's personal best on mount", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockHighScoreFetch.mockResolvedValueOnce(mockResponse({ highScore: 5 }));

    const { result } = renderHook(() => useGuessWhoController());

    await waitFor(() => expect(result.current.highScore).toBe(5));
    expect(mockHighScoreFetch).toHaveBeenCalledWith("/api/guess-who/high-score");
  });

  it("logs (without crashing) when the personal-best fetch fails", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockHighScoreFetch.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useGuessWhoController());

    await waitFor(() =>
      expect(mockLogEvent).toHaveBeenCalledWith(
        "warn",
        "guess_who_high_score_fetch_failed",
        expect.any(String),
        expect.anything(),
      ),
    );
    expect(result.current.highScore).toBeNull();
  });

  it("startGame begins a new run on success", async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));

    const { result } = renderHook(() => useGuessWhoController());
    await act(async () => {
      await result.current.startGame();
    });

    expect(result.current.started).toBe(true);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].sender).toBe(MYSTERY_NAME);
    expect(result.current.messages[0].text).toBe("Greetings, traveler. Ask me anything.");
    expect(result.current.starting).toBe(false);
  });

  it("startGame's progress reflects real server-reported stages and holds on the final one until the last frame arrives", async () => {
    const stream = mockControlledSseResponse();
    mockAuthenticatedFetch.mockResolvedValueOnce(stream.response);

    const { result } = renderHook(() => useGuessWhoController());
    let startPromise!: Promise<void>;
    act(() => {
      startPromise = result.current.startGame();
    });

    expect(result.current.startProgressMessage).toBe("Creating personality…");

    await act(async () => {
      stream.push({ stage: "avatar", done: false });
      await Promise.resolve();
    });
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

    const { result } = renderHook(() => useGuessWhoController());
    await act(async () => {
      await result.current.startGame();
    });

    expect(result.current.started).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "guess_who_client_start_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  async function startedHook() {
    mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));
    const rendered = renderHook(() => useGuessWhoController());
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
        "guess_who_audio_playback_error",
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
        "guess_who_audio_playback_aborted",
        "Audio playback aborted",
      ),
    );
  });

  it("replays a past character message through the shared audio player", async () => {
    const { result } = await startedHook();
    const message = {
      sender: MYSTERY_NAME,
      text: "The game is afoot.",
      audioFileUrl: "/api/audio?file=mystery.mp3",
    };

    mockPlayAudio.mockClear();
    await act(async () => {
      await result.current.replayMessageAudio(message);
    });

    expect(mockPlayAudio).toHaveBeenCalledWith(message.audioFileUrl);
  });

  it("regenerates a message's replay audio with the mystery speaker's gender withheld", async () => {
    const { result } = await startedHook();

    mockPlayAudio.mockClear();
    await act(async () => {
      await result.current.replayMessageAudio({
        sender: MYSTERY_NAME,
        text: "A reply with no audio of its own.",
      });
    });

    const replayUrl = mockPlayAudio.mock.calls[0][0] as string;
    const parsed = new URL(replayUrl, "https://example.com");
    expect(parsed.searchParams.get("botName")).toBe(MYSTERY_NAME);
    expect(parsed.searchParams.get("gender")).toBeNull();
  });

  it("sendMessage appends an ordinary reply without changing the token", async () => {
    const { result } = await startedHook();

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({ reply: "That's an interesting question." }),
    );

    act(() => result.current.setInput("Are you a king?"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.messages.some((m) => m.text === "That's an interesting question.")).toBe(
      true,
    );
    expect(result.current.guessWhoToken).toBe("token-1");
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
    expect(result.current.messages.some((m) => m.text === "I give up")).toBe(true);
    expect(result.current.messages).toHaveLength(2);

    act(() => result.current.clearGiveUpRequest());
    expect(result.current.giveUpRequested).toBe(false);
  });

  it("sendMessage judges a correct guess without generating the next round, then continueRound generates and applies it", async () => {
    const { result } = await startedHook();

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockResponse({
        reply: "Brilliant, you got it!",
        audioFileUrl: "/api/audio?file=reaction.mp3",
        correct: true,
        gameOver: false,
        guessWhoToken: "judged-token",
        revealedName: "Irene Adler",
        avatarUrl: "https://example.com/adler.png",
        gender: "female",
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
      avatarUrl: "https://example.com/adler.png",
      gender: "female",
      streak: 1,
    });
    expect(result.current.awaitingContinue).toBe(true);
    expect(result.current.guessWhoToken).toBe("judged-token");
    expect(result.current.streak).toBe(0);
    expect(result.current.messages.some((m) => m.text === "Brilliant, you got it!")).toBe(true);
    expect(result.current.messages.some((m) => m.text === "Ah, a new mystery begins.")).toBe(false);

    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockSseResponse([
        roundFrame({
          guessWhoToken: "token-2",
          reply: "Ah, a new mystery begins.",
          audioFileUrl: "/api/audio?file=opening2.mp3",
          streak: 1,
        }),
      ]),
    );
    await act(async () => {
      await result.current.continueRound();
    });

    expect(mockAuthenticatedFetch).toHaveBeenLastCalledWith(
      "/api/guess-who/continue",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ guessWhoToken: "judged-token", stream: true }),
      }),
    );
    expect(result.current.awaitingContinue).toBe(false);
    expect(result.current.guessWhoToken).toBe("token-2");
    expect(result.current.streak).toBe(1);
    expect(result.current.messages.some((m) => m.text === "Ah, a new mystery begins.")).toBe(true);
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
    expect(result.current.lastEvent).toMatchObject({
      type: "correct",
      revealedName: "Irene Adler",
      streak: 1,
    });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "guess_who_client_continue_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  it("sendMessage bumps the personal best optimistically for a signed-in player on a correct guess", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockHighScoreFetch.mockResolvedValueOnce(mockResponse({ highScore: 2 }));
    mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));

    const { result } = renderHook(() => useGuessWhoController());
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
    const { result } = await startedHook();

    // Round 1: one ordinary exchange.
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Interesting question." }));
    act(() => result.current.setInput("Are you old?"));
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
          guessWhoToken: "token-2",
          reply: "A new mystery begins.",
          streak: 1,
        }),
      ]),
    );
    await act(async () => {
      await result.current.continueRound();
    });

    // Round 2: one ordinary exchange.
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Ask away." }));
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
          guessWhoToken: "token-3",
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
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Elementary." }));
    act(() => result.current.setInput("Anything to add?"));
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
        guessWhoToken: "token-1-wrong",
      }),
    );

    act(() => result.current.setInput("Is it Zeus?"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.lastEvent).toEqual({ type: "wrong", wrongGuessesRemaining: 1 });
    expect(result.current.guessWhoToken).toBe("token-1-wrong");
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

    act(() => result.current.setInput("Is it Zeus?"));
    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.lastEvent).toMatchObject({
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
      "guess_who_client_message_failed",
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
      mockResponse({
        revealedName: "Irene Adler",
        avatarUrl: "https://example.com/adler.png",
        gender: "female",
        finalStreak: 0,
      }),
    );

    await act(async () => {
      await result.current.giveUp(true);
    });

    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      "/api/guess-who/give-up",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.current.lastEvent).toEqual({
      type: "gameover",
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/adler.png",
      gender: "female",
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
      "guess_who_client_give_up_failed",
      expect.any(String),
      expect.anything(),
    );
  });

  it("exposes isSpeechSupported straight from the hook", () => {
    const { result } = renderHook(() => useGuessWhoController());
    expect(result.current.isSpeechSupported).toBe(true);
  });

  it("overwrites the input with the live transcript while recording", () => {
    mockIsRecording = true;
    mockTranscript = "It's Irene Adler";
    const { result } = renderHook(() => useGuessWhoController());
    expect(result.current.input).toBe("It's Irene Adler");
  });

  it("routes a speech error into the game's error banner", () => {
    mockSpeechError = "No speech was detected. Please try again.";
    const { result } = renderHook(() => useGuessWhoController());
    expect(result.current.error).toBe("No speech was detected. Please try again.");
  });

  it("handleMicToggle calls toggleRecording when not loading", () => {
    const { result } = renderHook(() => useGuessWhoController());
    act(() => {
      result.current.handleMicToggle();
    });
    expect(mockToggleRecording).toHaveBeenCalledTimes(1);
  });

  it("force-stops any in-progress recording right after sending a message", async () => {
    const { result } = await startedHook();
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Interesting question." }));
    act(() => result.current.setInput("Are you old?"));
    await act(async () => {
      await result.current.sendMessage();
    });
    expect(mockStopRecording).toHaveBeenCalled();
  });

  it("clears a lingering speech error display once a message actually sends", async () => {
    mockSpeechError = "No speech was detected. Please try again.";
    const { result } = await startedHook();
    expect(result.current.error).toBe("No speech was detected. Please try again.");

    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Elementary." }));
    act(() => result.current.setInput("Are you old?"));
    await act(async () => {
      await result.current.sendMessage();
    });
    await waitFor(() => expect(result.current.error).toBe(""));
  });
});

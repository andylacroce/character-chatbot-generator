import { renderHook, act, waitFor } from "@testing-library/react";
import { GAME_MYSTERY_NAME, GUESS_WHO, GUESS_WHO_NEXT } from "character-chatbot-shared";
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
    String(args[0]).endsWith("/high-score")
      ? mockHighScoreFetch(...args)
      : mockAuthenticatedFetch(...args),
}));

const mockLogEvent = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (meta: unknown) => meta,
}));

const mockPlayAudio = jest.fn();
const mockStopAudio = jest.fn();
const mockIsAudioPlaying = jest.fn();
const mockAudioRef = { current: { muted: false } } as unknown as React.RefObject<HTMLAudioElement>;
jest.mock("../../../src/app/components/useAudioPlayer", () => ({
  useAudioPlayer: () => ({
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

// Mock the hook itself (not the browser API a second time), same rationale as
// useChatController.speech.test.ts.
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

import { useGameController } from "../../../src/app/components/useGameController";
import * as storage from "../../../src/utils/storage";

const mockStorage = storage as unknown as jest.Mocked<{
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  getJSON: jest.Mock;
  setJSON: jest.Mock;
}>;

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

describe.each([GUESS_WHO, GUESS_WHO_NEXT])("useGameController ($title)", (game) => {
  const prefix = game.eventPrefix;
  const tokenField = game.tokenField;
  // Who the header shows before any reveal: the named partner, or the mystery placeholder.
  const STARTING_SPEAKER = game.hidesSpeaker ? GAME_MYSTERY_NAME : "Sherlock Holmes";
  // A hidden-speaker game's correct guess / game over also releases the avatar and gender.
  const reveal = game.hidesSpeaker
    ? { avatarUrl: "https://example.com/adler.png", gender: "female" }
    : {};

  const render = () => renderHook(() => useGameController(game));

  /** A start/continue streamed success frame. */
  function roundFrame(overrides: Record<string, unknown> = {}) {
    return {
      [tokenField]: "token-1",
      ...(game.hidesSpeaker
        ? {}
        : {
            currentCharacterName: "Sherlock Holmes",
            avatarUrl: "https://example.com/sherlock.png",
            gender: "male",
          }),
      reply: "Greetings, traveler.",
      audioFileUrl: "/api/audio?file=intro.mp3",
      streak: 0,
      done: true,
      ...overrides,
    };
  }

  /** The persisted-state JSON (minus the token) the way either game's earlier builds wrote it. */
  function persisted(overrides: Record<string, unknown> = {}) {
    return {
      ...(game.hidesSpeaker
        ? {}
        : {
            currentCharacterName: "Sherlock Holmes",
            avatarUrl: "https://example.com/sherlock.png",
            gender: "male",
          }),
      streak: 0,
      messages: [{ sender: STARTING_SPEAKER, text: "Hello" }],
      roundStartIndex: 0,
      lastEvent: null,
      ...overrides,
    };
  }

  function storeRun(overrides: Record<string, unknown> = {}) {
    mockStorage.getItem.mockImplementation((key: string) =>
      key === game.storageKeys.token ? "persisted-token" : null,
    );
    mockStorage.getJSON.mockReturnValue(persisted(overrides));
  }

  async function startedHook() {
    mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));
    const rendered = render();
    await act(async () => {
      await rendered.result.current.startGame();
    });
    return rendered;
  }

  /** Types `text` and sends it, answering with `response`. */
  async function say(
    result: { current: ReturnType<typeof useGameController> },
    text: string,
    response: Record<string, unknown>,
  ) {
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse(response));
    act(() => result.current.setInput(text));
    await act(async () => {
      await result.current.sendMessage();
    });
  }

  const correctResponse = (overrides: Record<string, unknown> = {}) => ({
    reply: "Brilliant, you got it!",
    correct: true,
    gameOver: false,
    revealedName: "Irene Adler",
    ...reveal,
    streak: 1,
    ...overrides,
  });

  describe("persistence", () => {
    it("starts with no active run when nothing is persisted", () => {
      const { result } = render();
      expect(result.current.started).toBe(false);
      expect(result.current.messages).toEqual([]);
    });

    it("hydrates a run stored by an earlier build, with the right speaker", () => {
      storeRun({ streak: 2 });
      const { result } = render();
      expect(result.current.started).toBe(true);
      expect(result.current.streak).toBe(2);
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.speaker.name).toBe(STARTING_SPEAKER);
      expect(result.current.token).toBe("persisted-token");
    });

    it("restores the correct-guess banner on reload instead of silently discarding it", () => {
      const lastEvent = { type: "correct", revealedName: "Electra", streak: 1, ...reveal };
      storeRun({ lastEvent });
      const { result } = render();
      expect(result.current.awaitingContinue).toBe(true);
      expect(result.current.lastEvent).toEqual(lastEvent);
      // The next round genuinely hasn't been generated yet, so the token is still the judged one.
      expect(result.current.token).toBe("persisted-token");
    });

    it("persists the correct-guess banner so it survives a reload", async () => {
      const { result } = await startedHook();
      await say(result, "Electra", correctResponse({ revealedName: "Electra" }));

      expect(mockStorage.setJSON).toHaveBeenLastCalledWith(
        game.storageKeys.transcript,
        expect.objectContaining({
          lastEvent: { type: "correct", revealedName: "Electra", streak: 1, ...reveal },
        }),
      );
      // `streak` itself waits for Continue, but the displayed streak already shows the win.
      expect(result.current.streak).toBe(0);
      expect(result.current.displayedStreak).toBe(1);
    });

    it("persists only what this game needs: no speaker fields for a hidden speaker", async () => {
      await startedHook();
      const [, saved] = mockStorage.setJSON.mock.calls[mockStorage.setJSON.mock.calls.length - 1];
      expect("currentCharacterName" in saved).toBe(!game.hidesSpeaker);
      expect(mockStorage.setItem).toHaveBeenLastCalledWith(game.storageKeys.token, "token-1");
    });
  });

  describe("personal best", () => {
    it("fetches a cookie-bound personal best for a guest", async () => {
      const { result } = render();
      await waitFor(() => expect(result.current.highScore).toBeNull());
      expect(mockHighScoreFetch).toHaveBeenCalledWith(`/api/${game.slug}/high-score`);
      expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
    });

    it("fetches the signed-in user's personal best on mount", async () => {
      mockUseSession.mockReturnValue({ status: "authenticated" });
      mockHighScoreFetch.mockResolvedValueOnce(mockResponse({ highScore: 5 }));
      const { result } = render();
      await waitFor(() => expect(result.current.highScore).toBe(5));
    });

    it("keeps it null for a signed-in user who has never beaten a streak", async () => {
      mockUseSession.mockReturnValue({ status: "authenticated" });
      const { result } = render();
      await waitFor(() => expect(mockHighScoreFetch).toHaveBeenCalled());
      expect(result.current.highScore).toBeNull();
    });

    it("logs (without crashing) when the fetch fails", async () => {
      mockUseSession.mockReturnValue({ status: "authenticated" });
      mockHighScoreFetch.mockRejectedValueOnce(new Error("network down"));
      const { result } = render();
      await waitFor(() =>
        expect(mockLogEvent).toHaveBeenCalledWith(
          "warn",
          `${prefix}_high_score_fetch_failed`,
          expect.any(String),
          expect.anything(),
        ),
      );
      expect(result.current.highScore).toBeNull();
    });

    it("is bumped optimistically on a correct guess, never lowered", async () => {
      mockUseSession.mockReturnValue({ status: "authenticated" });
      mockHighScoreFetch.mockResolvedValueOnce(mockResponse({ highScore: 2 }));
      mockAuthenticatedFetch.mockResolvedValueOnce(mockSseResponse([roundFrame()]));
      const { result } = render();
      await waitFor(() => expect(result.current.highScore).toBe(2));
      await act(async () => {
        await result.current.startGame();
      });

      await say(result, "Irene Adler", correctResponse({ streak: 3 }));
      expect(result.current.highScore).toBe(3);
    });

    it("starts tracking for a guest with none on record on their first correct guess", async () => {
      const { result } = await startedHook();
      await say(result, "Irene Adler", correctResponse());
      expect(result.current.highScore).toBe(1);
    });
  });

  describe("startGame", () => {
    it("begins a new run on success", async () => {
      const { result } = await startedHook();
      expect(result.current.started).toBe(true);
      expect(result.current.speaker.name).toBe(STARTING_SPEAKER);
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].text).toBe("Greetings, traveler.");
      expect(result.current.messages[0].sender).toBe(STARTING_SPEAKER);
      expect(result.current.starting).toBe(false);
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        `/api/${game.slug}/start`,
        expect.objectContaining({ body: JSON.stringify({ stream: true }) }),
      );
    });

    it("reports real server-reported stages and holds on the final one until the last frame arrives", async () => {
      // Regression coverage for the switch from a blind client-side timer (which could show
      // a stage no longer actually happening) to real, server-reported progress.
      const stream = mockControlledSseResponse();
      mockAuthenticatedFetch.mockResolvedValueOnce(stream.response);

      const { result } = render();
      let startPromise!: Promise<void>;
      act(() => {
        startPromise = result.current.startGame();
      });
      expect(result.current.startProgressMessage).toBe("Creating personality…");

      await act(async () => {
        stream.push({ stage: "avatar", done: false });
        await Promise.resolve();
      });
      // Personality is still outstanding, so the label never jumps ahead just because
      // avatar happened to finish first.
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
      // Both phases are done but the final frame (real TTS synthesis) hasn't arrived:
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

    it("sets an error and stays unstarted on failure", async () => {
      mockAuthenticatedFetch.mockRejectedValueOnce(new Error("network down"));
      const { result } = render();
      await act(async () => {
        await result.current.startGame();
      });
      expect(result.current.started).toBe(false);
      expect(result.current.error).toBeTruthy();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        `${prefix}_client_start_failed`,
        expect.any(String),
        expect.anything(),
      );
    });
  });

  describe("audio", () => {
    it("logs an error when playback fails with a non-abort error", async () => {
      mockPlayAudio.mockRejectedValueOnce(new Error("playback failed"));
      await startedHook();
      await waitFor(() =>
        expect(mockLogEvent).toHaveBeenCalledWith(
          "error",
          `${prefix}_audio_playback_error`,
          "Audio playback failed",
          expect.anything(),
        ),
      );
    });

    it("logs info (not error) when playback is aborted", async () => {
      const abortErr = new Error("aborted");
      (abortErr as unknown as { name?: string }).name = "AbortError";
      mockPlayAudio.mockRejectedValueOnce(abortErr);
      await startedHook();
      await waitFor(() =>
        expect(mockLogEvent).toHaveBeenCalledWith(
          "info",
          `${prefix}_audio_playback_aborted`,
          "Audio playback aborted",
        ),
      );
    });

    it("replays a past message through the shared audio player", async () => {
      const { result } = render();
      const message = {
        sender: STARTING_SPEAKER,
        text: "The game is afoot.",
        audioFileUrl: "/api/audio?file=x.mp3",
      };
      mockPlayAudio.mockClear();
      await act(async () => {
        await result.current.replayMessageAudio(message);
      });
      expect(mockPlayAudio).toHaveBeenCalledWith(message.audioFileUrl);
    });

    it("reuses a speaker's already-cast voiceConfig when replaying a message with no audio of its own", async () => {
      // Regression test: without this, replaying a message whose own TTS never succeeded
      // built a /api/audio URL with no voiceConfig at all, forcing the server into a fresh,
      // context-free re-cast that could silently pick a different, even differently-gendered,
      // voice than every other line this speaker has said.
      const voiceConfig = {
        languageCodes: ["en-GB"],
        name: "en-GB-Standard-B",
        ssmlGender: 1,
        pitch: -2,
        rate: 0.95,
      };
      storeRun({
        messages: [
          {
            sender: STARTING_SPEAKER,
            text: "Greetings.",
            gender: "male",
            audioFileUrl: `/api/audio?file=intro.mp3&voiceConfig=${encodeURIComponent(
              JSON.stringify(voiceConfig),
            )}`,
          },
          { sender: "User", text: "Who are you?" },
        ],
      });
      const { result } = render();

      mockPlayAudio.mockClear();
      await act(async () => {
        // This specific message has no audioFileUrl of its own (its TTS call failed).
        await result.current.replayMessageAudio({
          sender: STARTING_SPEAKER,
          text: "Indeed.",
          gender: "male",
        });
      });

      const parsed = new URL(mockPlayAudio.mock.calls[0][0] as string, "https://example.com");
      expect(JSON.parse(parsed.searchParams.get("voiceConfig") ?? "null")).toEqual(voiceConfig);
    });

    it("regenerates a message's audio with that message's own gender hint, not a later speaker's", async () => {
      storeRun({ currentCharacterName: "Irene Adler", gender: "female" });
      const { result } = render();
      mockPlayAudio.mockClear();
      await act(async () => {
        await result.current.replayMessageAudio({
          sender: STARTING_SPEAKER,
          text: "An earlier line.",
          gender: "male",
        });
      });
      const parsed = new URL(mockPlayAudio.mock.calls[0][0] as string, "https://example.com");
      expect(parsed.searchParams.get("botName")).toBe(STARTING_SPEAKER);
      expect(parsed.searchParams.get("gender")).toBe("male");
    });

    if (game.hidesSpeaker) {
      it("withholds gender for a still-mystery speaker's message with no hint", async () => {
        const { result } = await startedHook();
        mockPlayAudio.mockClear();
        await act(async () => {
          await result.current.replayMessageAudio({
            sender: GAME_MYSTERY_NAME,
            text: "A reply with no audio of its own.",
          });
        });
        const parsed = new URL(mockPlayAudio.mock.calls[0][0] as string, "https://example.com");
        expect(parsed.searchParams.get("gender")).toBeNull();
      });
    }
  });

  describe("sendMessage", () => {
    it("appends an ordinary reply without changing the token", async () => {
      const { result } = await startedHook();
      await say(result, "What's your favorite case?", { reply: "I've solved many cases." });
      expect(result.current.messages.some((m) => m.text === "I've solved many cases.")).toBe(true);
      expect(result.current.token).toBe("token-1");
      expect(result.current.lastEvent).toBeNull();
      expect(mockAuthenticatedFetch).toHaveBeenLastCalledWith(
        `/api/${game.slug}/message`,
        expect.objectContaining({
          body: JSON.stringify({
            [tokenField]: "token-1",
            message: "What's your favorite case?",
            conversationHistory: ["Bot: Greetings, traveler."],
          }),
        }),
      );
    });

    it("sets giveUpRequested on a give-up request, without appending a reply", async () => {
      const { result } = await startedHook();
      await say(result, "I give up", { giveUpRequested: true });

      expect(result.current.giveUpRequested).toBe(true);
      // The player's own message is still shown, but no bot reply is appended for this turn.
      expect(result.current.messages.some((m) => m.text === "I give up")).toBe(true);
      expect(result.current.messages).toHaveLength(2);
      act(() => result.current.clearGiveUpRequest());
      expect(result.current.giveUpRequested).toBe(false);
    });

    it("does nothing when the input is empty", async () => {
      const { result } = await startedHook();
      const callsBefore = mockAuthenticatedFetch.mock.calls.length;
      await act(async () => {
        await result.current.sendMessage();
      });
      expect(mockAuthenticatedFetch.mock.calls.length).toBe(callsBefore);
    });

    it("sets an error on API failure", async () => {
      const { result } = await startedHook();
      mockAuthenticatedFetch.mockRejectedValueOnce(new Error("boom"));
      act(() => result.current.setInput("hello"));
      await act(async () => {
        await result.current.sendMessage();
      });
      expect(result.current.error).toBeTruthy();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        `${prefix}_client_message_failed`,
        expect.any(String),
        expect.anything(),
      );
    });

    it("sends on Enter", async () => {
      const { result } = await startedHook();
      mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "OK" }));
      act(() => result.current.setInput("Hello there"));
      act(() => result.current.handleKeyDown({ key: "Enter" } as unknown as React.KeyboardEvent));
      await waitFor(() => expect(result.current.messages.some((m) => m.text === "OK")).toBe(true));
    });

    it("tolerates a first wrong guess and keeps the run going", async () => {
      const { result } = await startedHook();
      await say(result, "Is it Moriarty?", {
        reply: "Not quite, try again?",
        correct: false,
        gameOver: false,
        wrongGuessesRemaining: 1,
        [tokenField]: "token-1-wrong",
      });
      expect(result.current.lastEvent).toEqual({ type: "wrong", wrongGuessesRemaining: 1 });
      expect(result.current.token).toBe("token-1-wrong");
      expect(result.current.started).toBe(true);
    });

    it("ends the run on a second wrong guess", async () => {
      const { result } = await startedHook();
      await say(result, "Is it Moriarty?", {
        reply: "Alas, it was Irene Adler.",
        correct: false,
        gameOver: true,
        revealedName: "Irene Adler",
        ...reveal,
        finalStreak: 0,
      });
      expect(result.current.lastEvent).toEqual({
        type: "gameover",
        revealedName: "Irene Adler",
        ...reveal,
        finalStreak: 0,
      });
      expect(result.current.started).toBe(false);
    });
  });

  describe("a correct guess and Continue", () => {
    it("judges without generating the next round, then continueRound generates and applies it", async () => {
      const { result } = await startedHook();

      // Judging the guess is deliberately fast and carries no round-switch data.
      await say(
        result,
        "It's Irene Adler!",
        correctResponse({
          audioFileUrl: "/api/audio?file=reaction.mp3",
          [tokenField]: "judged-token",
        }),
      );

      expect(result.current.lastEvent).toEqual({
        type: "correct",
        revealedName: "Irene Adler",
        ...reveal,
        streak: 1,
      });
      expect(result.current.awaitingContinue).toBe(true);
      expect(result.current.token).toBe("judged-token");
      expect(result.current.streak).toBe(0);
      expect(result.current.messages.some((m) => m.text === "Brilliant, you got it!")).toBe(true);
      expect(result.current.messages.some((m) => m.text === "Next hello.")).toBe(false);

      mockAuthenticatedFetch.mockResolvedValueOnce(
        mockSseResponse([
          roundFrame({
            [tokenField]: "token-2",
            ...(game.hidesSpeaker
              ? {}
              : {
                  currentCharacterName: "Irene Adler",
                  avatarUrl: "https://example.com/adler.png",
                  gender: "female",
                }),
            reply: "Next hello.",
            streak: 1,
          }),
        ]),
      );
      await act(async () => {
        await result.current.continueRound();
      });

      expect(mockAuthenticatedFetch).toHaveBeenLastCalledWith(
        `/api/${game.slug}/continue`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ [tokenField]: "judged-token", stream: true }),
        }),
      );
      expect(result.current.awaitingContinue).toBe(false);
      expect(result.current.token).toBe("token-2");
      expect(result.current.streak).toBe(1);
      expect(result.current.messages.some((m) => m.text === "Next hello.")).toBe(true);
      // A shown-speaker game hands the chat to the revealed character; a hidden-speaker
      // game goes back to a fresh mystery.
      expect(result.current.speaker.name).toBe(
        game.hidesSpeaker ? GAME_MYSTERY_NAME : "Irene Adler",
      );
    });

    it("restores the correct-guess banner and reports an error when Continue fails, so the player can retry", async () => {
      const { result } = await startedHook();
      await say(result, "It's Irene Adler!", correctResponse());

      mockAuthenticatedFetch.mockRejectedValueOnce(new Error("network down"));
      await act(async () => {
        await result.current.continueRound();
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.awaitingContinue).toBe(true);
      expect(result.current.lastEvent).toEqual({
        type: "correct",
        revealedName: "Irene Adler",
        ...reveal,
        streak: 1,
      });
      expect(mockLogEvent).toHaveBeenCalledWith(
        "error",
        `${prefix}_client_continue_failed`,
        expect.any(String),
        expect.anything(),
      );
    });

    it("excludes prior rounds' trailing messages from the next round's server-side history", async () => {
      // Regression test: roundStartIndex must be computed from the FULL messages array length
      // at the moment continueRound actually runs, not from the current round's slice length,
      // otherwise a round switch from round 2 onward leaks the prior round's tail (its own
      // Q&A, guess, and reaction) into the next round's conversationHistory. That only
      // coincided with correct behavior on the very first round switch.
      const { result } = await startedHook();

      const nextRound = (token: string, reply: string, streak: number) =>
        mockAuthenticatedFetch.mockResolvedValueOnce(
          mockSseResponse([roundFrame({ [tokenField]: token, reply, streak })]),
        );

      await say(result, "First question", { reply: "First answer." });
      await say(result, "It's Irene Adler!", correctResponse());
      nextRound("token-2", "Hello, round two.", 1);
      await act(async () => {
        await result.current.continueRound();
      });

      await say(result, "Second question", { reply: "Second answer." });
      await say(result, "It's Watson!", correctResponse({ revealedName: "Watson", streak: 2 }));
      nextRound("token-3", "Hello, round three.", 2);
      await act(async () => {
        await result.current.continueRound();
      });

      await say(result, "Third question", { reply: "Third answer." });

      const lastCall =
        mockAuthenticatedFetch.mock.calls[mockAuthenticatedFetch.mock.calls.length - 1];
      expect(JSON.parse(lastCall[1].body).conversationHistory).toEqual([
        "Bot: Hello, round three.",
      ]);
    });
  });

  describe("quit and give up", () => {
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
        mockResponse({ revealedName: "Irene Adler", ...reveal, finalStreak: 0 }),
      );
      await act(async () => {
        await result.current.giveUp(true);
      });

      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        `/api/${game.slug}/give-up`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(result.current.lastEvent).toEqual({
        type: "gameover",
        revealedName: "Irene Adler",
        ...reveal,
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
        `${prefix}_client_give_up_failed`,
        expect.any(String),
        expect.anything(),
      );
    });
  });

  if (game.hidesSpeaker) {
    describe("revealing the mystery", () => {
      it("shows the mystery placeholder until a reveal, then the real identity", async () => {
        const { result } = await startedHook();
        expect(result.current.speaker).toEqual({
          name: GAME_MYSTERY_NAME,
          avatarUrl: "/silhouette.svg",
          gender: null,
        });

        await say(result, "It's Irene Adler!", correctResponse());
        expect(result.current.speaker).toEqual({
          name: "Irene Adler",
          avatarUrl: "https://example.com/adler.png",
          gender: "female",
        });
      });

      it("retroactively reveals the whole round's transcript on a correct guess", async () => {
        const { result } = await startedHook();
        await say(result, "Are you old?", { reply: "Quite." });
        await say(result, "It's Irene Adler!", correctResponse());

        const botMessages = result.current.messages.filter((m) => m.sender !== "User");
        expect(botMessages).toHaveLength(3);
        // No line in the round is left attributed to "???", including the greeting.
        expect(botMessages.every((m) => m.sender === "Irene Adler")).toBe(true);
        expect(botMessages.every((m) => m.avatarUrl === "https://example.com/adler.png")).toBe(
          true,
        );
      });

      it("retroactively reveals the transcript on a give-up, which appends no reply of its own", async () => {
        const { result } = await startedHook();
        mockAuthenticatedFetch.mockResolvedValueOnce(
          mockResponse({ revealedName: "Irene Adler", ...reveal, finalStreak: 0 }),
        );
        await act(async () => {
          await result.current.giveUp(true);
        });
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].sender).toBe("Irene Adler");
      });

      it("leaves an earlier, already-revealed round's messages alone after Continue", async () => {
        const { result } = await startedHook();
        await say(result, "It's Irene Adler!", correctResponse());
        mockAuthenticatedFetch.mockResolvedValueOnce(
          mockSseResponse([
            roundFrame({ [tokenField]: "token-2", reply: "New mystery.", streak: 1 }),
          ]),
        );
        await act(async () => {
          await result.current.continueRound();
        });

        const senders = result.current.messages.map((m) => m.sender);
        expect(senders.slice(0, 1)).toEqual(["Irene Adler"]);
        expect(senders[senders.length - 1]).toBe(GAME_MYSTERY_NAME);
      });
    });
  }
});

describe("useGameController speech input orchestration", () => {
  const render = () => renderHook(() => useGameController(GUESS_WHO_NEXT));

  async function startedHook() {
    mockAuthenticatedFetch.mockResolvedValueOnce(
      mockSseResponse([
        {
          gameToken: "token-1",
          currentCharacterName: "Sherlock Holmes",
          avatarUrl: "https://example.com/sherlock.png",
          gender: "male",
          reply: "Greetings, detective.",
          streak: 0,
          done: true,
        },
      ]),
    );
    const rendered = render();
    await act(async () => {
      await rendered.result.current.startGame();
    });
    return rendered;
  }

  it("exposes isSpeechSupported straight from the hook", () => {
    expect(render().result.current.isSpeechSupported).toBe(true);
  });

  it("overwrites the input with the live transcript while recording", () => {
    mockIsRecording = true;
    mockTranscript = "It's Irene Adler";
    expect(render().result.current.input).toBe("It's Irene Adler");
  });

  it("routes a speech error into the game's error banner", () => {
    mockSpeechError = "No speech was detected. Please try again.";
    expect(render().result.current.error).toBe("No speech was detected. Please try again.");
  });

  it("handleMicToggle calls toggleRecording when not loading", () => {
    const { result } = render();
    act(() => {
      result.current.handleMicToggle();
    });
    expect(mockToggleRecording).toHaveBeenCalledTimes(1);
  });

  it("force-stops any in-progress recording right after sending a message", async () => {
    const { result } = await startedHook();
    mockAuthenticatedFetch.mockResolvedValueOnce(mockResponse({ reply: "Elementary." }));
    act(() => result.current.setInput("What's your favorite case?"));
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
    act(() => result.current.setInput("What's your favorite case?"));
    await act(async () => {
      await result.current.sendMessage();
    });
    await waitFor(() => expect(result.current.error).toBe(""));
  });
});

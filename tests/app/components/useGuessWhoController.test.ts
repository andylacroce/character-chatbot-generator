import { renderHook, act, waitFor } from "@testing-library/react";
import { mockResponse } from "../../helpers/mockResponse";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

const mockLogEvent = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
  sanitizeLogMeta: (meta: unknown) => meta,
}));

jest.mock("../../../src/utils/storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getJSON: jest.fn(),
  setJSON: jest.fn(),
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

function startResult(overrides: Record<string, unknown> = {}) {
  return {
    guessWhoToken: "token-1",
    clue: "Clue 1",
    clueNumber: 1,
    totalClues: 5,
    streak: 0,
    ...overrides,
  };
}

describe("useGuessWhoController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    mockStorage.getJSON.mockReturnValue(null);
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/guess-who/high-score")
        return Promise.resolve(mockResponse({ highScore: null }));
      return Promise.resolve(mockResponse({}));
    });
  });

  it("starts with no active run when nothing is persisted", () => {
    const { result } = renderHook(() => useGuessWhoController());
    expect(result.current.started).toBe(false);
    expect(result.current.clue).toBe("");
  });

  it("starts a new game and applies the first clue", async () => {
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/guess-who/start") return Promise.resolve(mockResponse(startResult()));
      return Promise.resolve(mockResponse({ highScore: null }));
    });
    const { result } = renderHook(() => useGuessWhoController());
    await act(async () => {
      await result.current.startGame();
    });
    expect(result.current.started).toBe(true);
    expect(result.current.clue).toBe("Clue 1");
    expect(result.current.clueNumber).toBe(1);
    expect(result.current.totalClues).toBe(5);
    expect(mockStorage.setJSON).toHaveBeenCalled();
  });

  it("shows an error when starting fails", async () => {
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/guess-who/start")
        return Promise.resolve(mockResponse({ error: "boom" }, 500));
      return Promise.resolve(mockResponse({ highScore: null }));
    });
    const { result } = renderHook(() => useGuessWhoController());
    await act(async () => {
      await result.current.startGame();
    });
    expect(result.current.started).toBe(false);
    expect(result.current.error).toMatch(/Failed to start/i);
  });

  it("submits a correct guess and shows the reveal event", async () => {
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/guess-who/start") return Promise.resolve(mockResponse(startResult()));
      if (url === "/api/guess-who/guess")
        return Promise.resolve(
          mockResponse({
            correct: true,
            gameOver: false,
            revealedName: "Irene Adler",
            avatarUrl: "https://example.com/irene.png",
            gender: "female",
            streak: 1,
            usedNames: ["Irene Adler"],
          }),
        );
      return Promise.resolve(mockResponse({ highScore: null }));
    });
    const { result } = renderHook(() => useGuessWhoController());
    await act(async () => {
      await result.current.startGame();
    });
    act(() => result.current.setGuess("Irene Adler"));
    await act(async () => {
      await result.current.submitGuess();
    });
    expect(result.current.lastEvent).toEqual({
      type: "correct",
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      streak: 1,
    });
    expect(result.current.awaitingContinue).toBe(true);
    expect(result.current.highScore).toBe(1);
  });

  it("submits a wrong guess and reveals the next clue", async () => {
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/guess-who/start") return Promise.resolve(mockResponse(startResult()));
      if (url === "/api/guess-who/guess")
        return Promise.resolve(
          mockResponse({
            correct: false,
            gameOver: false,
            clue: "Clue 2",
            clueNumber: 2,
            totalClues: 5,
            streak: 0,
            guessWhoToken: "token-2",
          }),
        );
      return Promise.resolve(mockResponse({ highScore: null }));
    });
    const { result } = renderHook(() => useGuessWhoController());
    await act(async () => {
      await result.current.startGame();
    });
    act(() => result.current.setGuess("Sherlock Holmes"));
    await act(async () => {
      await result.current.submitGuess();
    });
    expect(result.current.lastEvent).toEqual({
      type: "wrong",
      clue: "Clue 2",
      clueNumber: 2,
      totalClues: 5,
    });
    expect(result.current.clue).toBe("Clue 2");
    expect(result.current.guessWhoToken).toBe("token-2");
  });

  it("gives up and reveals the hidden name, ending the run", async () => {
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/guess-who/start") return Promise.resolve(mockResponse(startResult()));
      if (url === "/api/guess-who/give-up")
        return Promise.resolve(
          mockResponse({
            revealedName: "Irene Adler",
            avatarUrl: "https://example.com/irene.png",
            gender: "female",
            finalStreak: 0,
            gameOver: true,
          }),
        );
      return Promise.resolve(mockResponse({ highScore: null }));
    });
    const { result } = renderHook(() => useGuessWhoController());
    await act(async () => {
      await result.current.startGame();
    });
    await act(async () => {
      await result.current.giveUp(true);
    });
    expect(result.current.lastEvent).toMatchObject({
      type: "gameover",
      revealedName: "Irene Adler",
    });
    expect(result.current.guessWhoToken).toBeNull();
  });

  it("resumes an in-progress run from localStorage on mount", () => {
    mockStorage.getJSON.mockReturnValue({
      guessWhoToken: "persisted-token",
      clue: "Clue 3",
      clueNumber: 3,
      totalClues: 5,
      streak: 2,
      usedNames: ["Zeus"],
      lastEvent: null,
    });
    const { result } = renderHook(() => useGuessWhoController());
    expect(result.current.started).toBe(true);
    expect(result.current.clue).toBe("Clue 3");
    expect(result.current.streak).toBe(2);
  });

  it("fetches the personal best once identity resolves", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/guess-who/high-score")
        return Promise.resolve(mockResponse({ highScore: 5 }));
      return Promise.resolve(mockResponse({}));
    });
    const { result } = renderHook(() => useGuessWhoController());
    await waitFor(() => expect(result.current.highScore).toBe(5));
  });
});

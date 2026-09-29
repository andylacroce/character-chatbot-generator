import {
  applyGuessWhoResponse,
  GUESS_WHO_FALLBACK_AVATAR,
  parseGuessWhoRoundResult,
} from "./guessWho";

describe("applyGuessWhoResponse", () => {
  it("reports a correct guess with reveal details and the new streak", () => {
    const outcome = applyGuessWhoResponse({
      correct: true,
      gameOver: false,
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      streak: 3,
      usedNames: ["Sherlock Holmes", "Irene Adler"],
    });
    expect(outcome.event).toEqual({
      type: "correct",
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      streak: 3,
    });
    expect(outcome.guessWhoToken).toBeNull();
    expect(outcome.streak).toBe(3);
    expect(outcome.newStreak).toBe(3);
    expect(outcome.usedNames).toEqual(["Sherlock Holmes", "Irene Adler"]);
  });

  it("falls back to the placeholder avatar on a correct guess with no avatarUrl", () => {
    const outcome = applyGuessWhoResponse({
      correct: true,
      gameOver: false,
      revealedName: "Zeus",
      streak: 1,
    });
    expect(outcome.event).toMatchObject({ avatarUrl: GUESS_WHO_FALLBACK_AVATAR });
  });

  it("throws when a correct response has no revealedName", () => {
    expect(() => applyGuessWhoResponse({ correct: true, gameOver: false, streak: 1 })).toThrow(
      "Invalid response",
    );
  });

  it("ends the run on game over (out of clues) and resets the streak to 0", () => {
    const outcome = applyGuessWhoResponse({
      correct: false,
      gameOver: true,
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      streak: 2,
    });
    expect(outcome.event).toEqual({
      type: "gameover",
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      finalStreak: 2,
    });
    expect(outcome.guessWhoToken).toBeNull();
    expect(outcome.streak).toBe(0);
  });

  it("throws when a game-over response has no revealedName", () => {
    expect(() => applyGuessWhoResponse({ correct: false, gameOver: true, streak: 0 })).toThrow(
      "Invalid response",
    );
  });

  it("reveals the next clue on a wrong guess with clues remaining", () => {
    const outcome = applyGuessWhoResponse({
      correct: false,
      gameOver: false,
      clue: "Clue 3",
      clueNumber: 3,
      totalClues: 5,
      streak: 1,
      guessWhoToken: "fresh-token",
    });
    expect(outcome.event).toEqual({ type: "wrong", clue: "Clue 3", clueNumber: 3, totalClues: 5 });
    expect(outcome.guessWhoToken).toBe("fresh-token");
    expect(outcome.streak).toBe(1);
  });

  it("throws on a wrong-guess response missing clue fields", () => {
    expect(() => applyGuessWhoResponse({ correct: false, gameOver: false, streak: 0 })).toThrow(
      "Invalid response",
    );
  });
});

describe("parseGuessWhoRoundResult", () => {
  it("fills defaults for a valid round", () => {
    const round = parseGuessWhoRoundResult(
      { guessWhoToken: "t", clue: "Clue 1", clueNumber: 1, totalClues: 5 },
      "/api/guess-who/start",
    );
    expect(round).toEqual({
      guessWhoToken: "t",
      clue: "Clue 1",
      clueNumber: 1,
      totalClues: 5,
      streak: 0,
    });
  });

  it("throws the server's own error, or on a malformed payload", () => {
    expect(() => parseGuessWhoRoundResult({ error: "boom" }, "/x")).toThrow("boom");
    expect(() => parseGuessWhoRoundResult(null, "/x")).toThrow("Invalid response from /x");
  });
});

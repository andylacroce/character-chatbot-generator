import {
  applyGuessWhoMessageResponse,
  GUESS_WHO_FALLBACK_AVATAR,
  GUESS_WHO_MYSTERY_NAME,
  guessWhoRoundGreeting,
  parseGuessWhoRoundResult,
  toGuessWhoConversationHistory,
} from "./guessWho";

describe("applyGuessWhoMessageResponse", () => {
  it("flags a give-up request with no reply", () => {
    expect(applyGuessWhoMessageResponse({ giveUpRequested: true })).toEqual({
      giveUpRequested: true,
      reply: null,
      lastEvent: null,
    });
  });

  it("rejects a response with no reply", () => {
    expect(() => applyGuessWhoMessageResponse({})).toThrow("Invalid response");
  });

  it("attributes an ordinary reply to the mystery sender and leaves the token alone", () => {
    const outcome = applyGuessWhoMessageResponse({ reply: "Hmm, interesting guess.", audioFileUrl: "/a" });
    expect(outcome.reply).toEqual({
      sender: GUESS_WHO_MYSTERY_NAME,
      text: "Hmm, interesting guess.",
      audioFileUrl: "/a",
    });
    expect(outcome.lastEvent).toBeNull();
    expect(outcome.guessWhoToken).toBeUndefined();
  });

  it("reports a correct guess with reveal details, the new streak, and token", () => {
    const outcome = applyGuessWhoMessageResponse({
      reply: "Yes, exactly!",
      correct: true,
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      streak: 3,
      guessWhoToken: "t2",
    });
    expect(outcome.reply).toEqual({
      sender: GUESS_WHO_MYSTERY_NAME,
      text: "Yes, exactly!",
      audioFileUrl: undefined,
    });
    expect(outcome.lastEvent).toEqual({
      type: "correct",
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      streak: 3,
    });
    expect(outcome.guessWhoToken).toBe("t2");
    expect(outcome.newStreak).toBe(3);
  });

  it("falls back to the placeholder avatar and null gender on a correct guess with none given", () => {
    const outcome = applyGuessWhoMessageResponse({
      reply: "Yes!",
      correct: true,
      revealedName: "Zeus",
      streak: 1,
    });
    expect(outcome.lastEvent).toMatchObject({
      avatarUrl: GUESS_WHO_FALLBACK_AVATAR,
      gender: null,
    });
  });

  it("throws when a correct response has no revealedName", () => {
    expect(() => applyGuessWhoMessageResponse({ reply: "Yes!", correct: true, streak: 1 })).toThrow(
      "Invalid response",
    );
  });

  it("ends the run on game over and nulls the token", () => {
    const outcome = applyGuessWhoMessageResponse({
      reply: "No, that's not it.",
      gameOver: true,
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      finalStreak: 2,
    });
    expect(outcome.lastEvent).toEqual({
      type: "gameover",
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      finalStreak: 2,
    });
    expect(outcome.guessWhoToken).toBeNull();
  });

  it("throws when a game-over response has no revealedName", () => {
    expect(() => applyGuessWhoMessageResponse({ reply: "No.", gameOver: true, finalStreak: 0 })).toThrow(
      "Invalid response",
    );
  });

  it("tolerates a first wrong guess", () => {
    const outcome = applyGuessWhoMessageResponse({
      reply: "Not quite.",
      wrongGuessesRemaining: 1,
      guessWhoToken: "t3",
    });
    expect(outcome.lastEvent).toEqual({ type: "wrong", wrongGuessesRemaining: 1 });
    expect(outcome.guessWhoToken).toBe("t3");
  });
});

describe("parseGuessWhoRoundResult", () => {
  it("fills defaults for a valid round", () => {
    const round = parseGuessWhoRoundResult(
      { guessWhoToken: "t", reply: "Greetings, traveler." },
      "/api/guess-who/start",
    );
    expect(round).toEqual({
      guessWhoToken: "t",
      reply: "Greetings, traveler.",
      audioFileUrl: undefined,
      streak: 0,
    });
    expect(guessWhoRoundGreeting(round)).toEqual({
      sender: GUESS_WHO_MYSTERY_NAME,
      text: "Greetings, traveler.",
      audioFileUrl: undefined,
    });
  });

  it("throws the server's own error, or on a malformed payload", () => {
    expect(() => parseGuessWhoRoundResult({ error: "boom" }, "/x")).toThrow("boom");
    expect(() => parseGuessWhoRoundResult(null, "/x")).toThrow("Invalid response from /x");
  });
});

describe("helpers", () => {
  it("formats history lines by speaker", () => {
    expect(
      toGuessWhoConversationHistory([
        { sender: "User", text: "Are you a king?" },
        { sender: GUESS_WHO_MYSTERY_NAME, text: "Perhaps." },
      ]),
    ).toEqual(["User: Are you a king?", "Bot: Perhaps."]);
  });
});

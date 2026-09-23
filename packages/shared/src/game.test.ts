import {
  applyGameMessageResponse,
  fillTemplate,
  parseGameRoundResult,
  roundGreeting,
  toGameConversationHistory,
} from "./game";

const speaker = { name: "Sherlock Holmes", avatarUrl: "https://example.com/s.png" };

describe("applyGameMessageResponse", () => {
  it("flags a give-up request with no reply", () => {
    expect(applyGameMessageResponse({ giveUpRequested: true }, speaker)).toEqual({
      giveUpRequested: true,
      reply: null,
      lastEvent: null,
    });
  });

  it("rejects a response with no reply", () => {
    expect(() => applyGameMessageResponse({}, speaker)).toThrow("Invalid response");
  });

  it("attributes an ordinary reply to the speaker and leaves the token alone", () => {
    const outcome = applyGameMessageResponse({ reply: "Elementary.", audioFileUrl: "/a" }, speaker);
    expect(outcome.reply).toEqual({
      sender: "Sherlock Holmes",
      text: "Elementary.",
      audioFileUrl: "/a",
      avatarUrl: speaker.avatarUrl,
    });
    expect(outcome.lastEvent).toBeNull();
    expect(outcome.gameToken).toBeUndefined();
  });

  it("reports a correct guess with the new streak and token", () => {
    const outcome = applyGameMessageResponse(
      { reply: "Yes!", correct: true, revealedName: "Irene Adler", streak: 2, gameToken: "t2" },
      speaker,
    );
    expect(outcome.lastEvent).toEqual({ type: "correct", revealedName: "Irene Adler", streak: 2 });
    expect(outcome.gameToken).toBe("t2");
    expect(outcome.newStreak).toBe(2);
  });

  it("ends the run on game over", () => {
    const outcome = applyGameMessageResponse(
      { reply: "No.", gameOver: true, revealedName: "Irene Adler", finalStreak: 3 },
      speaker,
    );
    expect(outcome.lastEvent).toEqual({
      type: "gameover",
      revealedName: "Irene Adler",
      finalStreak: 3,
    });
    expect(outcome.gameToken).toBeNull();
  });

  it("tolerates a first wrong guess", () => {
    const outcome = applyGameMessageResponse(
      { reply: "Not quite.", wrongGuessesRemaining: 1, gameToken: "t3" },
      speaker,
    );
    expect(outcome.lastEvent).toEqual({ type: "wrong", wrongGuessesRemaining: 1 });
    expect(outcome.gameToken).toBe("t3");
  });
});

describe("parseGameRoundResult", () => {
  it("fills defaults for a valid round", () => {
    const round = parseGameRoundResult(
      { gameToken: "t", currentCharacterName: "Zeus", reply: "Hail." },
      "/api/game/start",
    );
    expect(round).toMatchObject({ avatarUrl: "/silhouette.svg", gender: null, streak: 0 });
    expect(roundGreeting(round)).toEqual({
      sender: "Zeus",
      text: "Hail.",
      audioFileUrl: undefined,
      avatarUrl: "/silhouette.svg",
    });
  });

  it("throws the server's own error, or on a malformed payload", () => {
    expect(() => parseGameRoundResult({ error: "boom" }, "/x")).toThrow("boom");
    expect(() => parseGameRoundResult(null, "/x")).toThrow("Invalid response from /x");
  });
});

describe("helpers", () => {
  it("formats history lines by speaker", () => {
    expect(
      toGameConversationHistory([
        { sender: "User", text: "Hi" },
        { sender: "Zeus", text: "Hail" },
      ]),
    ).toEqual(["User: Hi", "Bot: Hail"]);
  });

  it("fills known placeholders and leaves unknown ones", () => {
    expect(fillTemplate("{name} scored {streak} {x}", { name: "Ann", streak: 3 })).toBe(
      "Ann scored 3 {x}",
    );
  });
});

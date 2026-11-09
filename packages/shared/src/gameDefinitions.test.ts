import {
  applyGameMessageResponse,
  parseGameMessageResponse,
  parseGameRoundResult,
} from "./gameState";
import { GAME_LIST, gameApiUrl, gameBySlug, GUESS_WHO, GUESS_WHO_NEXT } from "./gameDefinitions";

const speaker = {
  name: "Sherlock Holmes",
  avatarUrl: "https://example.com/s.png",
  gender: "male",
};

describe("game definitions", () => {
  it("lists Guess Who first, everywhere both games appear", () => {
    expect(GAME_LIST.map((game) => game.id)).toEqual(["guessWho", "guessWhoNext"]);
  });

  it("keeps each game's historical wire token name, so released mobile builds keep working", () => {
    expect(GUESS_WHO.tokenField).toBe("guessWhoToken");
    expect(GUESS_WHO_NEXT.tokenField).toBe("gameToken");
  });

  it("resolves a game from its URL slug and builds its endpoint URLs", () => {
    expect(gameBySlug("guess-who-next")).toBe(GUESS_WHO_NEXT);
    expect(gameBySlug("nope")).toBeUndefined();
    expect(gameApiUrl(GUESS_WHO, "give-up")).toBe("/api/guess-who/give-up");
  });
});

describe.each([GUESS_WHO, GUESS_WHO_NEXT])("shared helpers ($id)", (game) => {
  it("throws the server's own error, or on a malformed round payload", () => {
    expect(() => parseGameRoundResult(game, { error: "boom" }, "/x")).toThrow("boom");
    expect(() => parseGameRoundResult(game, null, "/x")).toThrow("Invalid response from /x");
  });

  it("normalizes the wire token name on a message response", () => {
    const parsed = parseGameMessageResponse(game, { reply: "Hi", [game.tokenField]: "t9" });
    expect(parsed).toEqual({ reply: "Hi", token: "t9" });
  });

  it("flags a give-up request with no reply", () => {
    expect(applyGameMessageResponse(game, { giveUpRequested: true }, speaker)).toEqual({
      giveUpRequested: true,
      reply: null,
      lastEvent: null,
    });
  });

  it("rejects a response with no reply", () => {
    expect(() => applyGameMessageResponse(game, {}, speaker)).toThrow("Invalid response");
  });

  it("tolerates a first wrong guess and adopts the bumped token", () => {
    const outcome = applyGameMessageResponse(
      game,
      { reply: "Not quite.", wrongGuessesRemaining: 1, token: "t3" },
      speaker,
    );
    expect(outcome.lastEvent).toEqual({ type: "wrong", wrongGuessesRemaining: 1 });
    expect(outcome.token).toBe("t3");
  });
});

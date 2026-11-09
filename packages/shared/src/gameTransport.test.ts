import { createGameTransport } from "./gameTransport";
import { gameApiUrl, GUESS_WHO, GUESS_WHO_NEXT, type GameDefinition } from "./gameDefinitions";

describe.each<[GameDefinition, string]>([
  [GUESS_WHO, "guessWhoToken"],
  [GUESS_WHO_NEXT, "gameToken"],
])("createGameTransport (%#)", (game, tokenField) => {
  const roundPayload = {
    [tokenField]: "t",
    reply: "Hi",
    currentCharacterName: "Zeus",
    streak: 0,
  };

  it("sends each request to the game's own URL with its own wire token name", async () => {
    const post = jest.fn().mockResolvedValue({ reply: "Ok", [tokenField]: "t2" });
    const round = jest.fn().mockResolvedValue(roundPayload);
    const get = jest.fn().mockResolvedValue({ highScore: 4 });
    const transport = createGameTransport(game, { get, post, round });

    await expect(transport.start()).resolves.toMatchObject({ token: "t" });
    expect(round).toHaveBeenCalledWith("start", gameApiUrl(game, "start"), {});

    await transport.continueRound("tok");
    expect(round).toHaveBeenLastCalledWith("continue", gameApiUrl(game, "continue"), {
      [tokenField]: "tok",
    });

    await expect(
      transport.sendMessage({ token: "tok", message: "hi", conversationHistory: ["User: a"] }),
    ).resolves.toEqual({ reply: "Ok", token: "t2" });
    expect(post).toHaveBeenLastCalledWith(gameApiUrl(game, "message"), {
      [tokenField]: "tok",
      message: "hi",
      conversationHistory: ["User: a"],
    });

    await transport.giveUp("tok");
    expect(post).toHaveBeenLastCalledWith(gameApiUrl(game, "give-up"), { [tokenField]: "tok" });

    await expect(transport.getHighScore()).resolves.toEqual({ highScore: 4 });
    expect(get).toHaveBeenCalledWith(gameApiUrl(game, "high-score"));
  });
});

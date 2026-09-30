import {
  applyGameMessageResponse,
  createGameTransport,
  fillTemplate,
  GAME_FALLBACK_AVATAR,
  GAME_LIST,
  GAME_MYSTERY_NAME,
  gameApiUrl,
  gameBySlug,
  gameRoundGreeting,
  giveUpEvent,
  GUESS_WHO,
  GUESS_WHO_NEXT,
  parseGameMessageResponse,
  parseGameRoundResult,
  revealedSpeaker,
  revealGameMessages,
  toGameConversationHistory,
  type GameDefinition,
} from "./game";

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

describe("Guess Who's Next (shown speaker)", () => {
  const game = GUESS_WHO_NEXT;

  it("parses a round with its named speaker, filling defaults", () => {
    const round = parseGameRoundResult(
      game,
      { gameToken: "t", currentCharacterName: "Zeus", reply: "Hail." },
      "/api/guess-who-next/start",
    );
    expect(round).toMatchObject({
      token: "t",
      streak: 0,
      speaker: { name: "Zeus", avatarUrl: GAME_FALLBACK_AVATAR, gender: null },
    });
    expect(gameRoundGreeting(game, round)).toEqual({
      sender: "Zeus",
      text: "Hail.",
      audioFileUrl: undefined,
      avatarUrl: GAME_FALLBACK_AVATAR,
      gender: null,
    });
  });

  it("rejects a round that omits the speaker", () => {
    expect(() => parseGameRoundResult(game, { gameToken: "t", reply: "Hail." }, "/x")).toThrow(
      "Invalid response",
    );
  });

  it("attributes an ordinary reply to the speaker and leaves the token alone", () => {
    const outcome = applyGameMessageResponse(
      game,
      { reply: "Elementary.", audioFileUrl: "/a" },
      speaker,
    );
    expect(outcome.reply).toEqual({
      sender: "Sherlock Holmes",
      text: "Elementary.",
      audioFileUrl: "/a",
      avatarUrl: speaker.avatarUrl,
      gender: "male",
    });
    expect(outcome.lastEvent).toBeNull();
    expect(outcome.token).toBeUndefined();
  });

  it("reports a correct guess without reveal fields, still spoken by the speaker", () => {
    const outcome = applyGameMessageResponse(
      game,
      { reply: "Yes!", correct: true, revealedName: "Irene Adler", streak: 2, token: "t2" },
      speaker,
    );
    expect(outcome.reply?.sender).toBe("Sherlock Holmes");
    expect(outcome.lastEvent).toEqual({ type: "correct", revealedName: "Irene Adler", streak: 2 });
    expect(outcome.token).toBe("t2");
    expect(outcome.newStreak).toBe(2);
  });

  it("ends the run on game over", () => {
    const outcome = applyGameMessageResponse(
      game,
      { reply: "No.", gameOver: true, revealedName: "Irene Adler", finalStreak: 3 },
      speaker,
    );
    expect(outcome.lastEvent).toEqual({
      type: "gameover",
      revealedName: "Irene Adler",
      finalStreak: 3,
    });
    expect(outcome.token).toBeNull();
  });

  it("builds a give-up event with no reveal fields", () => {
    expect(giveUpEvent(game, { revealedName: "Zeus", finalStreak: 2, gameOver: true })).toEqual({
      type: "gameover",
      revealedName: "Zeus",
      finalStreak: 2,
    });
  });
});

describe("Guess Who (hidden speaker)", () => {
  const game = GUESS_WHO;
  const reveal = {
    revealedName: "Irene Adler",
    avatarUrl: "https://example.com/irene.png",
    gender: "female",
  };

  it("parses a round with no identity and greets as the mystery", () => {
    const round = parseGameRoundResult(
      game,
      { guessWhoToken: "t", reply: "Greetings, traveler." },
      "/api/guess-who/start",
    );
    expect(round).toEqual({
      token: "t",
      speaker: null,
      reply: "Greetings, traveler.",
      audioFileUrl: undefined,
      streak: 0,
    });
    expect(gameRoundGreeting(game, round)).toEqual({
      sender: GAME_MYSTERY_NAME,
      text: "Greetings, traveler.",
      audioFileUrl: undefined,
    });
  });

  it("attributes an ordinary reply to the mystery sender", () => {
    const outcome = applyGameMessageResponse(
      game,
      { reply: "Hmm, interesting guess.", audioFileUrl: "/a" },
      speaker,
    );
    expect(outcome.reply).toEqual({
      sender: GAME_MYSTERY_NAME,
      text: "Hmm, interesting guess.",
      audioFileUrl: "/a",
    });
    expect(outcome.lastEvent).toBeNull();
  });

  it("reveals the identity on a correct guess, in the reply and the event", () => {
    const outcome = applyGameMessageResponse(
      game,
      { reply: "Yes, exactly!", correct: true, ...reveal, streak: 3, token: "t2" },
      speaker,
    );
    // The reaction reply is spoken by the revealed identity; the caller pairs this with
    // revealGameMessages to retroactively update the rest of the round's transcript.
    expect(outcome.reply).toEqual({
      sender: "Irene Adler",
      text: "Yes, exactly!",
      audioFileUrl: undefined,
      avatarUrl: reveal.avatarUrl,
      gender: "female",
    });
    expect(outcome.lastEvent).toEqual({ type: "correct", ...reveal, streak: 3 });
    expect(outcome.token).toBe("t2");
    expect(outcome.newStreak).toBe(3);
  });

  it("falls back to the placeholder avatar and null gender when a reveal has none", () => {
    const outcome = applyGameMessageResponse(
      game,
      { reply: "Yes!", correct: true, revealedName: "Zeus", streak: 1 },
      speaker,
    );
    expect(outcome.lastEvent).toMatchObject({ avatarUrl: GAME_FALLBACK_AVATAR, gender: null });
  });

  it("throws when a reveal has no revealedName", () => {
    expect(() =>
      applyGameMessageResponse(game, { reply: "Yes!", correct: true, streak: 1 }, speaker),
    ).toThrow("Invalid response");
    expect(() =>
      applyGameMessageResponse(game, { reply: "No.", gameOver: true, finalStreak: 0 }, speaker),
    ).toThrow("Invalid response");
  });

  it("reveals the identity on game over and nulls the token", () => {
    const outcome = applyGameMessageResponse(
      game,
      { reply: "No, that's not it.", gameOver: true, ...reveal, finalStreak: 2 },
      speaker,
    );
    expect(outcome.reply?.sender).toBe("Irene Adler");
    expect(outcome.lastEvent).toEqual({ type: "gameover", ...reveal, finalStreak: 2 });
    expect(outcome.token).toBeNull();
  });

  it("builds a give-up event carrying the reveal, with fallbacks", () => {
    expect(giveUpEvent(game, { ...reveal, finalStreak: 2, gameOver: true })).toEqual({
      type: "gameover",
      ...reveal,
      finalStreak: 2,
    });
    expect(giveUpEvent(game, { revealedName: "Zeus", finalStreak: 0, gameOver: true })).toEqual({
      type: "gameover",
      revealedName: "Zeus",
      avatarUrl: GAME_FALLBACK_AVATAR,
      gender: null,
      finalStreak: 0,
    });
  });
});

describe("revealedSpeaker / revealGameMessages", () => {
  const irene = {
    name: "Irene Adler",
    avatarUrl: "https://example.com/irene.png",
    gender: "female",
  };

  it("reads a reveal off a correct or game-over event only", () => {
    expect(revealedSpeaker({ type: "correct", revealedName: "Irene Adler", streak: 1 })).toEqual({
      name: "Irene Adler",
      avatarUrl: GAME_FALLBACK_AVATAR,
      gender: null,
    });
    expect(revealedSpeaker({ type: "wrong", wrongGuessesRemaining: 1 })).toBeNull();
    expect(revealedSpeaker(null)).toBeNull();
  });

  it("swaps every mystery-sender message from fromIndex onward to the revealed identity", () => {
    const messages = [
      { sender: GAME_MYSTERY_NAME, text: "Greetings." },
      { sender: "User", text: "Are you a king?" },
      { sender: GAME_MYSTERY_NAME, text: "Perhaps." },
    ];
    expect(revealGameMessages(messages, 0, irene)).toEqual([
      { sender: "Irene Adler", text: "Greetings.", avatarUrl: irene.avatarUrl, gender: "female" },
      { sender: "User", text: "Are you a king?" },
      { sender: "Irene Adler", text: "Perhaps.", avatarUrl: irene.avatarUrl, gender: "female" },
    ]);
  });

  it("leaves messages before fromIndex untouched, e.g. a prior, already-revealed round", () => {
    const messages = [
      { sender: "Zeus", text: "You found me before." },
      { sender: GAME_MYSTERY_NAME, text: "Greetings anew." },
    ];
    expect(revealGameMessages(messages, 1, irene)).toEqual([
      { sender: "Zeus", text: "You found me before." },
      {
        sender: "Irene Adler",
        text: "Greetings anew.",
        avatarUrl: irene.avatarUrl,
        gender: "female",
      },
    ]);
  });
});

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

import {
  INTRO_PROMPT,
  buildChatRequest,
  formatChatHistory,
  longerHistory,
  parseChatMessages,
} from "./chat";
import type { CharacterVoiceConfig } from "./types";

const voice = {
  languageCodes: ["en-GB"],
  name: "en-GB-Wavenet-B",
} as unknown as CharacterVoiceConfig;
const bot = { name: "Ada", personality: "Witty.", gender: "female" };

describe("formatChatHistory", () => {
  it("labels the bot's turns Bot: and everything else User:", () => {
    const out = formatChatHistory(
      [
        { sender: "User", text: "hi" },
        { sender: "Ada", text: "hello" },
        { sender: "Someone Named Pat", text: "yo" },
      ],
      "Ada",
    );
    expect(out).toEqual(["User: hi", "Bot: hello", "User: yo"]);
  });

  it("keeps only the 20 most recent turns", () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({ sender: "User", text: `m${i}` }));
    const out = formatChatHistory(messages, "Ada");
    expect(out).toHaveLength(20);
    expect(out[0]).toBe("User: m5");
    expect(out[19]).toBe("User: m24");
  });
});

describe("parseChatMessages", () => {
  it("drops malformed entries and keeps valid turns", () => {
    const raw = [
      { sender: "User", text: "ok" },
      null,
      3,
      { sender: "User" },
      { text: "x" },
      { sender: 1, text: "y" },
    ];
    expect(parseChatMessages(raw)).toEqual([{ sender: "User", text: "ok" }]);
  });

  it.each([null, undefined, "str", 7, { sender: "User", text: "a" }])(
    "returns [] for non-array %p",
    (raw) => {
      expect(parseChatMessages(raw)).toEqual([]);
    },
  );
});

describe("longerHistory", () => {
  it("adopts the server list only when strictly longer", () => {
    const local = [{ sender: "User", text: "a" }];
    const longer = [...local, { sender: "Ada", text: "b" }];
    expect(longerHistory(local, longer)).toBe(longer);
    expect(longerHistory(longer, local)).toBe(longer);
    expect(longerHistory(local, [{ sender: "Ada", text: "other" }])).toBe(local);
  });
});

describe("buildChatRequest", () => {
  it("builds an ordinary turn with formatted history and no isIntro key", () => {
    const req = buildChatRequest({
      bot,
      voiceConfig: voice,
      message: "hi",
      history: [{ sender: "Ada", text: "hello" }],
      userName: "Pat",
    });
    expect(req).toEqual({
      message: "hi",
      personality: "Witty.",
      botName: "Ada",
      gender: "female",
      conversationHistory: ["Bot: hello"],
      voiceConfig: voice,
      userName: "Pat",
    });
    expect("isIntro" in req).toBe(false);
  });

  it("builds the intro with empty history and isIntro set", () => {
    const req = buildChatRequest({
      bot: { ...bot, gender: null },
      voiceConfig: voice,
      message: INTRO_PROMPT,
      isIntro: true,
    });
    expect(req).toMatchObject({
      message: INTRO_PROMPT,
      conversationHistory: [],
      isIntro: true,
      gender: undefined,
    });
  });
});

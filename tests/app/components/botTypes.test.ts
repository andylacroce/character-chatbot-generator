import {
  persistedBotToBot,
  type PersistedBot,
} from "../../../src/app/components/character/botTypes";
import * as BotCreatorModule from "../../../src/app/components/character/BotCreator";

const row: PersistedBot = {
  id: "1",
  name: "Ada",
  personality: "curious",
  avatarUrl: "a.png",
  gender: "female",
  voiceConfig: null,
  updatedAt: "2026-01-01",
};

describe("persistedBotToBot", () => {
  it("maps a saved row onto the Bot shape", () => {
    expect(persistedBotToBot(row)).toEqual({
      name: "Ada",
      personality: "curious",
      avatarUrl: "a.png",
      voiceConfig: null,
      gender: "female",
    });
  });

  it("falls back to the silhouette when there is no portrait", () => {
    expect(persistedBotToBot({ ...row, avatarUrl: null }).avatarUrl).toBe("/silhouette.svg");
  });

  it("is still re-exported from BotCreator for existing importers", () => {
    expect(BotCreatorModule.persistedBotToBot).toBe(persistedBotToBot);
  });
});

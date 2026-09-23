import type { Bot } from "character-chatbot-shared";

export type RootStackParamList = {
  Creator: undefined;
  CharWall: undefined;
  History: undefined;
  Game: undefined;
  Leaderboard: undefined;
  Chat: { bot: Bot };
};

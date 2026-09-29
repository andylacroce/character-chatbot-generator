import type { Bot } from "character-chatbot-shared";

export type RootStackParamList = {
  Creator: undefined;
  CharWall: undefined;
  History: undefined;
  GuessWhoNext: undefined;
  Leaderboard: undefined;
  Chat: { bot: Bot };
};

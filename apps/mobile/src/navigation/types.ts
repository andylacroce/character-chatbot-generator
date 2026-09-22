import type { Bot } from "character-chatbot-shared";

export type RootStackParamList = {
  Creator: undefined;
  CharWall: undefined;
  Chat: { bot: Bot };
};

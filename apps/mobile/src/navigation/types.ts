import type { Bot } from "character-chatbot-shared";

export type RootStackParamList = {
  Creator: undefined;
  CharWall: undefined;
  History: undefined;
  Chat: { bot: Bot };
};

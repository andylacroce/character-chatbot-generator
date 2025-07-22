/**
 * Entry point component for the Character Chatbot Generator application.
 * Uses Next.js dynamic imports for optimal loading performance.
 * @module index
 */

"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Bot } from "./components/BotCreator";
import { getValidBotFromStorage } from "../src/utils/getValidBotFromStorage";

/**
 * Dynamically import the ChatPage component with server-side rendering enabled.
 * This allows for code splitting while maintaining SEO benefits.
 *
 * @const {React.ComponentType}
 */
const ChatPage = dynamic(() => import("../app/components/ChatPage"), {
  ssr: true,
});

/**
 * Dynamically import BotCreator for code splitting
 */
const BotCreator = dynamic(() => import("./components/BotCreator"), { ssr: false });

/**
 * Home component that serves as the main entry point of the application.
 * Renders the dynamically imported ChatPage component.
 *
 * @function
 * @returns {JSX.Element} The rendered ChatPage component
 */
const Home = () => {

  // Add state for bot selection at the top level
  const [bot, setBot] = React.useState<Bot | null>(null);
  const [loadingBot, setLoadingBot] = React.useState(true);

  // Restore bot from localStorage on mount, using utility
  React.useEffect(() => {
    setBot(getValidBotFromStorage());
    setLoadingBot(false);
  }, []);

  // Save bot to localStorage whenever it changes, with timestamp
  React.useEffect(() => {
    if (bot) {
      localStorage.setItem("chatbot-bot", JSON.stringify(bot));
      localStorage.setItem("chatbot-bot-timestamp", Date.now().toString());
    }
  }, [bot]);

  const handleBackToCharacterCreation = React.useCallback(() => setBot(null), []);
  if (loadingBot) return null; // Prevent UI flash
  if (!bot) {
    return <BotCreator onBotCreated={setBot} />;
  }
  // Pass bot as prop to ChatPage
  return <ChatPage bot={bot} onBackToCharacterCreation={handleBackToCharacterCreation} />;
};

export default Home;

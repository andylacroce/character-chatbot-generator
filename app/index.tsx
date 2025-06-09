/**
 * Entry point component for the Gandalf chatbot application.
 * Uses Next.js dynamic imports for optimal loading performance.
 * @module index
 */

"use client";

import React from "react";
import dynamic from "next/dynamic";
import BotCreator, { Bot } from "./components/BotCreator";

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
 * Home component that serves as the main entry point of the application.
 * Renders the dynamically imported ChatPage component.
 *
 * @function
 * @returns {JSX.Element} The rendered ChatPage component
 */
const Home = () => {
  // Add state for bot selection at the top level
  const [bot, setBot] = React.useState<Bot | null>(null);

  // Restore bot from localStorage on mount
  React.useEffect(() => {
    if (bot) return; // Don't overwrite if already set
    try {
      const saved = localStorage.getItem("chatbot-bot");
      if (saved) {
        setBot(JSON.parse(saved));
      }
    } catch (e) {}
  }, []);

  // Save bot to localStorage whenever it changes
  React.useEffect(() => {
    if (bot) {
      localStorage.setItem("chatbot-bot", JSON.stringify(bot));
    } else {
      localStorage.removeItem("chatbot-bot");
    }
  }, [bot]);

  const handleBackToCharacterCreation = React.useCallback(() => setBot(null), []);
  if (!bot) {
    return <BotCreator onBotCreated={setBot} />;
  }
  // Pass bot as prop to ChatPage
  return <ChatPage bot={bot} onBackToCharacterCreation={handleBackToCharacterCreation} />;
};

export default Home;

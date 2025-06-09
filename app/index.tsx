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
  const handleBackToCharacterCreation = React.useCallback(() => setBot(null), []);
  if (!bot) {
    return <BotCreator onBotCreated={setBot} />;
  }
  // Pass bot as prop to ChatPage
  return <ChatPage bot={bot} onBackToCharacterCreation={handleBackToCharacterCreation} />;
};

export default Home;

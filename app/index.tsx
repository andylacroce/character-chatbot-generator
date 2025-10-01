/**
 * Entry point component for the Character Chatbot Generator application.
 * Uses Next.js dynamic imports for optimal loading performance.
 * @module index
 */

"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  const [bot, setBot] = React.useState<Bot | null>(null);
  const [loadingBot, setLoadingBot] = React.useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const nameFromUrl = searchParams?.get('name');
  const [returningToCreator, setReturningToCreator] = React.useState(false);

  // Restore bot from localStorage on mount, using utility
  React.useEffect(() => {
    // If name is provided in URL, don't load existing bot
    if (nameFromUrl) {
      setLoadingBot(false);
    } else {
      setBot(getValidBotFromStorage());
      setLoadingBot(false);
    }
  }, [nameFromUrl]);

  // Save bot to localStorage whenever it changes, with timestamp
  React.useEffect(() => {
    if (bot) {
      localStorage.setItem("chatbot-bot", JSON.stringify(bot));
      localStorage.setItem("chatbot-bot-timestamp", Date.now().toString());
    }
  }, [bot]);

  const handleBotCreated = React.useCallback((bot: Bot) => {
    setBot(bot);
    setReturningToCreator(false);
    // Store voiceConfig in sessionStorage keyed by character name
    if (bot.voiceConfig) {
      sessionStorage.setItem(`voiceConfig-${bot.name}`, JSON.stringify(bot.voiceConfig));
    }
  }, []);

  const handleBackToCharacterCreation = React.useCallback(() => {
    // Clear the bot from localStorage to kill the session
    localStorage.removeItem("chatbot-bot");
    localStorage.removeItem("chatbot-bot-timestamp");
    setBot(null);
    setReturningToCreator(true);
    router.push('/');
  }, [router]);
  if (loadingBot) return null; // Prevent UI flash
  if (!bot) {
    return <BotCreator onBotCreated={handleBotCreated} returningToCreator={returningToCreator} />;
  }
  // Pass bot as prop to ChatPage
  return <ChatPage bot={bot} onBackToCharacterCreation={handleBackToCharacterCreation} />;
};

/**
 * HomeWithSuspense component that wraps Home in a Suspense boundary
 * to handle useSearchParams() in client components.
 *
 * @function
 * @returns {JSX.Element} The rendered Home component wrapped in Suspense
 */
const HomeWithSuspense = () => {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
};

export default HomeWithSuspense;

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
import storage from '../src/utils/storage';

// Known storage key patterns to attempt migration on startup
const KNOWN_KEYS_TO_MIGRATE = [
  "chatbot-bot",
  "chatbot-bot-timestamp",
  "lastPlayedAudioHash-", // suffixed by bot name
  "voiceConfig-", // suffixed by bot name
  "chatbot-history-", // suffixed by bot name
  "audioEnabled",
  "darkMode",
];

export function runStartupMigrations() {
  try {
    // For keys that are pattern-based (suffix), scan localStorage for matches
    if (typeof window !== 'undefined' && window.localStorage) {
      const keys = Object.keys(localStorage || {});
      keys.forEach((k) => {
        // If any known prefix matches, attempt migration
        for (const prefix of KNOWN_KEYS_TO_MIGRATE) {
          if (prefix.endsWith('-') || prefix.endsWith('-')) {
            // prefix already includes dash to indicate suffix-style keys
          }
          if (k === prefix || k.startsWith(prefix)) {
            try {
              // Attempt to migrate; transform is optional and not provided here
              storage.migrateToVersioned(k, 1);
            } catch {
              // swallow migration errors — runtime should be tolerant
            }
            break;
          }
        }
      });
    }
  } catch {
    // not fatal
  }
}

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
      const loadedBot = getValidBotFromStorage();
      setBot(loadedBot);
      setLoadingBot(false);
      // Store voiceConfig in local storage (versioned) when loading existing bot
      if (loadedBot?.voiceConfig) {
        try {
          storage.setVersionedJSON(`voiceConfig-${loadedBot.name}`, loadedBot.voiceConfig, 1);
        } catch {}
      }
    }
  }, [nameFromUrl]);

  // Save bot to localStorage whenever it changes, with timestamp
  React.useEffect(() => {
    if (bot) {
      storage.setJSON("chatbot-bot", bot);
      storage.setItem("chatbot-bot-timestamp", Date.now().toString());
    }
  }, [bot]);

  const handleBotCreated = React.useCallback((bot: Bot) => {
    setBot(bot);
    setReturningToCreator(false);
    // Store voiceConfig in localStorage (versioned) keyed by character name for durability
    if (bot.voiceConfig) {
      try {
        storage.setVersionedJSON(`voiceConfig-${bot.name}`, bot.voiceConfig, 1);
      } catch {}
    }
  }, []);

  const handleBackToCharacterCreation = React.useCallback(() => {
    // Clear the bot from localStorage to kill the session
  storage.removeItem("chatbot-bot");
  storage.removeItem("chatbot-bot-timestamp");
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

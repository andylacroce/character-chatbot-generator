/**
 * Entry point component for the Character Chatbot Generator application.
 * Uses Next.js dynamic imports for optimal loading performance.
 * @module index
 */

"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { Bot } from "./components/BotCreator";
import { getValidBotFromStorage } from "../src/utils/getValidBotFromStorage";
import storage from '../src/utils/storage';
import { authenticatedFetch } from "../src/utils/api";
import { STORAGE_KEYS, STORAGE_KEY_PREFIXES, voiceConfigKey } from "../src/utils/storageKeys";

// Known storage key patterns to attempt migration on startup
const KNOWN_KEYS_TO_MIGRATE = [
  STORAGE_KEYS.bot,
  STORAGE_KEYS.botTimestamp,
  STORAGE_KEY_PREFIXES.lastPlayedAudioHash, // suffixed by bot name
  STORAGE_KEY_PREFIXES.voiceConfig, // suffixed by bot name
  STORAGE_KEY_PREFIXES.chatHistory, // suffixed by bot name
  STORAGE_KEYS.audioEnabled,
  STORAGE_KEYS.darkMode,
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
  const { status: sessionStatus } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const nameFromUrl = searchParams?.get('name');
  const [returningToCreator, setReturningToCreator] = React.useState(false);

  // Restore bot from localStorage on mount, using utility. This page is SSR'd, and
  // localStorage doesn't exist on the server, so this has to stay a post-mount effect
  // rather than a useState initializer (which would run during SSR too).
  /* eslint-disable react-hooks/set-state-in-effect */
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
          storage.setVersionedJSON(voiceConfigKey(loadedBot.name), loadedBot.voiceConfig, 1);
        } catch {}
      }
    }
  }, [nameFromUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Save bot to localStorage whenever it changes, with timestamp
  React.useEffect(() => {
    if (bot) {
      storage.setJSON(STORAGE_KEYS.bot, bot);
      storage.setItem(STORAGE_KEYS.botTimestamp, Date.now().toString());
    }
  }, [bot]);

  const handleBotCreated = React.useCallback((bot: Bot) => {
    setBot(bot);
    setReturningToCreator(false);
    // Persist server-side when signed in — fire-and-forget, never blocks or breaks
    // bot creation itself. Guests (sessionStatus !== "authenticated") skip this
    // entirely; the API also no-ops for them as a second, server-side guarantee.
    // A character created past an overridden copyright warning (bot.skipPersistence)
    // also skips this — it works for this session exactly like a guest's, via
    // localStorage below, but is never written to this user's own bots row either.
    if (sessionStatus === "authenticated" && !bot.skipPersistence) {
      authenticatedFetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: bot.name,
          personality: bot.personality,
          avatarUrl: bot.avatarUrl,
          gender: bot.gender,
          voiceConfig: bot.voiceConfig,
        }),
      }).catch(() => {
        // Persistence is a bonus for signed-in users, not a requirement — the bot
        // still works locally via localStorage exactly as it does for guests.
      });
    }
    // Store voiceConfig in localStorage (versioned) keyed by character name for durability
    if (bot.voiceConfig) {
      try {
        storage.setVersionedJSON(voiceConfigKey(bot.name), bot.voiceConfig, 1);
      } catch {}
    }
  }, [sessionStatus]);

  const handleBackToCharacterCreation = React.useCallback(() => {
    // Clear the bot from localStorage to kill the session
  storage.removeItem(STORAGE_KEYS.bot);
  storage.removeItem(STORAGE_KEYS.botTimestamp);
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

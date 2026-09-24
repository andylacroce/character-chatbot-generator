"use client";

/**
 * The web app's preferred-name hook: character-chatbot-shared's useUserNameState (shared with
 * the mobile app) over localStorage and /api/user-profile. See that module for the behavior,
 * and CLAUDE.md's "Personalized greeting" section for where the name is used.
 */

import { useSession } from "next-auth/react";
import {
  useUserNameState,
  type UserNameContext,
  type UserNameStore,
  type UserProfileTransport,
  STORAGE_KEYS,
} from "character-chatbot-shared";
import { authenticatedFetch } from "../../utils/api";
import storage from "../../utils/storage";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";

export type { UserNameContext } from "character-chatbot-shared";

const store: UserNameStore = {
  loadName: () => storage.getItem(STORAGE_KEYS.userName),
  saveName: (name) => storage.setItem(STORAGE_KEYS.userName, name),
  loadGateSkipped: () => storage.getItem(STORAGE_KEYS.userNameGateSkipped) === "1",
  saveGateSkipped: () => storage.setItem(STORAGE_KEYS.userNameGateSkipped, "1"),
};

const profile: UserProfileTransport = {
  get: () => authenticatedFetch("/api/user-profile").then((res) => res.json()),
  save: (name) =>
    authenticatedFetch("/api/user-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
};

/** Logs a preferred-name failure (browser only). */
function log(event: string, message: string, error: unknown) {
  if (typeof window === "undefined") return;
  logEvent(
    "warn",
    event,
    message,
    sanitizeLogMeta({ error: error instanceof Error ? error.message : String(error) }),
  );
}

/** Reads/writes the current user's preferred name (see module doc above). */
export function useUserName(): UserNameContext {
  const { status } = useSession();
  return useUserNameState({
    store,
    profile,
    signedIn: status === "loading" ? null : status === "authenticated",
    log,
  });
}

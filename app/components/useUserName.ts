"use client";

/**
 * Manages the human user's own preferred name — what a character should call them,
 * distinct from any character's name. Guests keep it in localStorage only; a signed-in
 * user's value is persisted server-side via /api/user-profile (see CLAUDE.md's
 * "Account persistence" section) so it follows them across devices.
 */

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../src/utils/api";
import storage from "../../src/utils/storage";
import { STORAGE_KEYS } from "../../src/utils/storageKeys";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";

/** Return shape of {@link useUserName} — shared with useBotCreation's post-creation name gate. */
export interface UserNameContext {
  name: string;
  setName: (value: string) => void;
  isResolved: boolean;
  hasSkippedGate: boolean;
  markGateSkipped: () => void;
}

/**
 * Reads/writes the current user's preferred name, sourcing it from localStorage for a
 * guest or /api/user-profile for a signed-in user, and seeding the server once from any
 * pre-existing guest value on first sign-in.
 */
export function useUserName(): UserNameContext {
  const { status: sessionStatus } = useSession();
  const [name, setNameState] = useState<string>(() => storage.getItem(STORAGE_KEYS.userName) || "");
  // True once we authoritatively know the current name (or lack of one) — for a guest
  // that's immediate (a synchronous localStorage read); for a signed-in user, only once
  // the /api/user-profile fetch below has settled. Callers (the post-creation name gate)
  // use this to avoid asking an already-named signed-in user again just because the
  // fetch hadn't returned yet.
  const [isResolved, setIsResolved] = useState<boolean>(
    sessionStatus !== "loading" && sessionStatus !== "authenticated",
  );
  const [hasSkippedGate, setHasSkippedGate] = useState<boolean>(
    () => storage.getItem(STORAGE_KEYS.userNameGateSkipped) === "1",
  );
  // Guards the one-time guest->DB seed so it only ever fires once per sign-in, not on
  // every render while sessionStatus stays "authenticated".
  const hasSeededRef = useRef(false);

  // A guest is resolved as soon as sessionStatus settles to "unauthenticated" — a plain
  // state update during render (React's "adjusting state when a prop changes" pattern)
  // instead of an effect, since it's purely derived from sessionStatus with no external
  // system involved. The authenticated branch below still needs a real effect, since it
  // waits on an actual network fetch.
  const [lastSessionStatus, setLastSessionStatus] = useState(sessionStatus);
  if (sessionStatus !== lastSessionStatus) {
    setLastSessionStatus(sessionStatus);
    if (sessionStatus !== "loading" && sessionStatus !== "authenticated") {
      setIsResolved(true);
    }
  }

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    let cancelled = false;
    authenticatedFetch("/api/user-profile")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const serverName = typeof data?.name === "string" ? data.name : "";
        if (serverName) {
          setNameState(serverName);
          return;
        }
        // No name saved server-side yet — seed it once from a guest-entered
        // localStorage value so the user doesn't have to retype it after signing in.
        const localName = storage.getItem(STORAGE_KEYS.userName) || "";
        if (localName && !hasSeededRef.current) {
          hasSeededRef.current = true;
          authenticatedFetch("/api/user-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: localName }),
          }).catch(() => {
            /* best-effort seed, same resilience pattern as other account-persistence writes */
          });
        }
      })
      .catch((err) => {
        if (typeof window !== "undefined") {
          logEvent(
            "warn",
            "user_name_fetch_failed",
            "Failed to load preferred name",
            sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  /** Updates the preferred name, persisting to the server when signed in or localStorage otherwise. */
  const setName = (value: string) => {
    setNameState(value);
    storage.setItem(STORAGE_KEYS.userName, value);
    if (sessionStatus === "authenticated") {
      authenticatedFetch("/api/user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      }).catch((err) => {
        if (typeof window !== "undefined") {
          logEvent(
            "warn",
            "user_name_persist_failed",
            "Failed to save preferred name",
            sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
          );
        }
      });
    }
  };

  /** Marks the post-creation name gate as dismissed in this browser, so it won't reappear. */
  const markGateSkipped = () => {
    setHasSkippedGate(true);
    storage.setItem(STORAGE_KEYS.userNameGateSkipped, "1");
  };

  return { name, setName, isResolved, hasSkippedGate, markGateSkipped };
}

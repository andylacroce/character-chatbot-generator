/**
 * The visitor's own preferred name (what a character should call them, distinct from any
 * character's name), shared by the web app's and the mobile app's useUserName hooks. A
 * guest's name lives only in local storage; a signed-in user's is also persisted through
 * /api/user-profile so it follows them across devices, seeded once from any name they'd
 * already typed as a guest. Each platform supplies its storage and request functions.
 */

import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "./types";

type MaybePromise<T> = T | Promise<T>;

/** Local persistence. Reads may be synchronous (localStorage) or async (AsyncStorage). */
export interface UserNameStore {
  loadName(): MaybePromise<string | null>;
  saveName(name: string): void | Promise<void>;
  loadGateSkipped(): MaybePromise<boolean>;
  saveGateSkipped(): void | Promise<void>;
}

export interface UserProfileTransport {
  get(): Promise<UserProfile>;
  save(name: string): Promise<unknown>;
}

export interface UseUserNameStateOptions {
  store: UserNameStore;
  profile: UserProfileTransport;
  /** Sign-in state: `null` while it's still resolving. */
  signedIn: boolean | null;
  log: (event: string, message: string, error: unknown) => void;
}

/** Return shape of the platforms' useUserName hooks (also used by the post-creation name gate). */
export interface UserNameContext {
  name: string;
  setName: (value: string) => void;
  /**
   * True once the current name (or its absence) is known for sure: immediately for a guest
   * once local storage is read, and only after the profile fetch settles when signed in, so
   * an already-named signed-in user isn't asked again just because the fetch was slow.
   */
  isResolved: boolean;
  hasSkippedGate: boolean;
  markGateSkipped: () => void;
}

/** Reads a value now when the store is synchronous, so the first render already has it. */
function readNow<T>(value: MaybePromise<T>, fallback: T): T {
  return value instanceof Promise ? fallback : value;
}

/** Shared preferred-name state, see module doc above. */
export function useUserNameState({
  store,
  profile,
  signedIn,
  log,
}: UseUserNameStateOptions): UserNameContext {
  const [initial] = useState(() => ({
    name: store.loadName(),
    skipped: store.loadGateSkipped(),
  }));
  const [name, setNameState] = useState(() => readNow(initial.name, null) ?? "");
  const [hasSkippedGate, setHasSkippedGate] = useState(() => readNow(initial.skipped, false));
  const [localLoaded, setLocalLoaded] = useState(
    () => !(initial.name instanceof Promise) && !(initial.skipped instanceof Promise),
  );
  const [profileSettled, setProfileSettled] = useState(false);
  // Guards the one-time guest-to-account seed so it fires once per sign-in, not per render.
  const hasSeededRef = useRef(false);

  useEffect(() => {
    if (localLoaded) return;
    let cancelled = false;
    Promise.all([initial.name, initial.skipped]).then(([storedName, skipped]) => {
      if (cancelled) return;
      if (storedName) setNameState(storedName);
      setHasSkippedGate(skipped);
      setLocalLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initial, localLoaded]);

  useEffect(() => {
    if (signedIn !== true) return;
    let cancelled = false;
    profile
      .get()
      .then(async (data) => {
        if (cancelled) return;
        if (data?.name) {
          setNameState(data.name);
          return;
        }
        // Nothing saved to the account yet: seed it once from a guest-entered local name
        // so the user doesn't have to retype it after signing in.
        const localName = await store.loadName();
        if (localName && !hasSeededRef.current) {
          hasSeededRef.current = true;
          profile.save(localName).catch(() => {
            // Best-effort seed, like every other account-persistence write.
          });
        }
      })
      .catch((err: unknown) => log("user_name_fetch_failed", "Failed to load preferred name", err))
      .finally(() => {
        if (!cancelled) setProfileSettled(true);
      });
    return () => {
      cancelled = true;
    };
    // Keyed on sign-in state only; the store and profile functions are stable per platform.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  /** Updates the name locally, and on the account when signed in. */
  const setName = (value: string) => {
    setNameState(value);
    void store.saveName(value);
    if (signedIn) {
      profile
        .save(value)
        .catch((err: unknown) =>
          log("user_name_persist_failed", "Failed to save preferred name", err),
        );
    }
  };

  /** Dismisses the post-creation name gate on this device for good. */
  const markGateSkipped = () => {
    setHasSkippedGate(true);
    void store.saveGateSkipped();
  };

  const isResolved = signedIn === true ? profileSettled : signedIn === false && localLoaded;
  return { name, setName, isResolved, hasSkippedGate, markGateSkipped };
}

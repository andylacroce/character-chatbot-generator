import { useEffect, useRef, useState } from "react";
import { getUserProfile, saveUserProfile } from "./api";
import {
  loadUserName,
  loadUserNameGateSkipped,
  saveUserName,
  saveUserNameGateSkipped,
} from "./storage";
import { useAuth } from "./AuthContext";

/** Return shape of {@link useUserName} — mirrors the web app's UserNameContext. */
export interface UserNameContext {
  name: string;
  setName: (value: string) => void;
  isResolved: boolean;
  hasSkippedGate: boolean;
  markGateSkipped: () => void;
}

/**
 * Reads/writes the visitor's own preferred name — what a character should call them,
 * distinct from any character's own name. Sources it from AsyncStorage for a guest, or
 * GET/POST /api/user-profile for a signed-in user (seeding the server once from any
 * pre-existing guest value on first sign-in) — mirrors the web app's useUserName.ts.
 */
export function useUserName(): UserNameContext {
  const auth = useAuth();
  const [name, setNameState] = useState("");
  // True once we authoritatively know the current name (or lack of one) — for a guest
  // that's as soon as the AsyncStorage read resolves; for a signed-in user, only once
  // the /api/user-profile fetch below has settled.
  const [isResolved, setIsResolved] = useState(false);
  const [hasSkippedGate, setHasSkippedGate] = useState(false);
  // Guards the one-time guest->DB seed so it only ever fires once per sign-in.
  const hasSeededRef = useRef(false);

  useEffect(() => {
    Promise.all([loadUserName(), loadUserNameGateSkipped()]).then(([storedName, skipped]) => {
      if (storedName) setNameState(storedName);
      setHasSkippedGate(skipped);
      if (auth.status !== "signedIn") setIsResolved(true);
    });
    // Intentionally once on mount — the signed-in sync below is a separate effect keyed
    // on auth.status, so this one doesn't need to react to it too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (auth.status !== "signedIn") return;
    getUserProfile()
      .then((profile) => {
        if (profile.preferredName) {
          setNameState(profile.preferredName);
          return;
        }
        // No name saved server-side yet — seed it once from a guest-entered local value
        // so the user doesn't have to retype it after signing in.
        if (!hasSeededRef.current) {
          loadUserName().then((localName) => {
            if (localName && !hasSeededRef.current) {
              hasSeededRef.current = true;
              saveUserProfile(localName).catch(() => {});
            }
          });
        }
      })
      .catch(() => {
        // Best effort — keep whatever local value is already loaded.
      })
      .finally(() => setIsResolved(true));
  }, [auth.status]);

  const setName = (value: string) => {
    setNameState(value);
    saveUserName(value);
    if (auth.status === "signedIn") {
      saveUserProfile(value).catch(() => {});
    }
  };

  const markGateSkipped = () => {
    setHasSkippedGate(true);
    saveUserNameGateSkipped();
  };

  return { name, setName, isResolved, hasSkippedGate, markGateSkipped };
}

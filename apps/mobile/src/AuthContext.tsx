import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getMobileSession,
  loadAuthToken,
  signInWithGoogle,
  signOut,
  type SignInResult,
} from "./auth";

type AuthStatus = "loading" | "signedIn" | "signedOut";

interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  name: string | null;
  signIn: () => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  email: null,
  name: null,
  signIn: async () => ({ ok: false, error: "not_ready" }),
  signOut: async () => {},
});

/**
 * Hydrates the persisted bearer token on mount and, once one exists, resolves its
 * display identity via GET /api/auth/mobile-session — mirrors ThemeContext's shape.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  const applyIdentity = (session: {
    userId: string | null;
    email: string | null;
    name: string | null;
  }) => {
    if (!session.userId) {
      setStatus("signedOut");
      setEmail(null);
      setName(null);
      return;
    }
    setEmail(session.email);
    setName(session.name);
    setStatus("signedIn");
  };

  /**
   * Re-resolves the current bearer token's identity — called after a successful
   * sign-in (not from an effect, so a plain async/await call is fine there).
   */
  const refreshIdentity = async () => {
    const token = await loadAuthToken();
    if (!token) {
      setStatus("signedOut");
      setEmail(null);
      setName(null);
      return;
    }
    try {
      applyIdentity(await getMobileSession());
    } catch {
      // A transient network failure shouldn't drop an already-signed-in user back to
      // signed-out — leave the previous state alone and retry on the next mount/call.
      setStatus((prev) => (prev === "loading" ? "signedOut" : prev));
    }
  };

  useEffect(() => {
    // Built as an inline .then()/.catch() chain rather than calling the `refreshIdentity`
    // closure directly — react-hooks/set-state-in-effect flags any local function that
    // sets state being invoked from an effect body, even behind an await; chaining
    // callbacks straight off the promise (same pattern as CreatorScreen's
    // loadBot().then(setSavedBot)) is what the rule recognizes as the "external system
    // callback" shape.
    loadAuthToken()
      .then((token) => (token ? getMobileSession() : { userId: null, email: null, name: null }))
      .then(applyIdentity)
      .catch(() => setStatus((prev) => (prev === "loading" ? "signedOut" : prev)));
    // Intentionally once on mount.
  }, []);

  const handleSignIn = async (): Promise<SignInResult> => {
    const result = await signInWithGoogle();
    if (result.ok) await refreshIdentity();
    return result;
  };

  const handleSignOut = async () => {
    await signOut();
    setStatus("signedOut");
    setEmail(null);
    setName(null);
  };

  return (
    <AuthContext.Provider
      value={{ status, email, name, signIn: handleSignIn, signOut: handleSignOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

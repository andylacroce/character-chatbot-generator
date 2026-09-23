/**
 * Sign-in via the backend's browser-redirect bridge (pages/api/auth/mobile-auth-start.ts
 * / -complete.ts in the backend repo) — not expo-auth-session or
 * @react-native-google-signin, since plain Expo Go has no supported native Google
 * Sign-In path and a magic-link email flow needs a real browser tab regardless of
 * platform. This opens the backend's own NextAuth sign-in page (the same page/form a
 * web visitor uses, offering both Google and email) in a browser tab and reads the
 * resulting bearer token back — the backend runs both providers' real flows itself.
 */
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import type { MobileSessionResponse } from "character-chatbot-shared";
import { API_BASE_URL, apiFetch } from "./api";
import { clearAuthToken, setAuthToken } from "./authToken";

export { loadAuthToken, getCachedAuthToken } from "./authToken";

export type SignInResult = { ok: true } | { ok: false; error: string };

/**
 * Opens the backend's sign-in bridge in a browser tab and persists the bearer token it
 * redirects back with. `error: "cancelled"` means the user closed the tab without
 * completing sign-in — not a real failure.
 */
export async function signIn(): Promise<SignInResult> {
  const redirectUri = Linking.createURL("auth");
  const startUrl = `${API_BASE_URL}/api/auth/mobile-auth-start?redirect_uri=${encodeURIComponent(redirectUri)}`;

  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);
  if (result.type === "cancel" || result.type === "dismiss") {
    return { ok: false, error: "cancelled" };
  }
  if (result.type !== "success" || !result.url) {
    return { ok: false, error: "failed" };
  }

  const { queryParams } = Linking.parse(result.url);
  const token = queryParams?.token;
  const error = queryParams?.error;
  if (typeof error === "string") return { ok: false, error };
  if (typeof token !== "string" || !token) return { ok: false, error: "missing_token" };

  await setAuthToken(token);
  return { ok: true };
}

/** Clears the persisted bearer token. */
export async function signOut(): Promise<void> {
  await clearAuthToken();
}

/** Resolves the signed-in identity for the current token, or all-null if signed out. */
export function getMobileSession(): Promise<MobileSessionResponse> {
  return apiFetch<MobileSessionResponse>("/api/auth/mobile-session");
}

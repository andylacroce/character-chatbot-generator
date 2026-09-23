/**
 * Google sign-in via the backend's browser-redirect bridge (pages/api/auth/
 * mobile-google-start.ts / -callback.ts in the backend repo) — not expo-auth-session or
 * @react-native-google-signin, since plain Expo Go has no supported native Google
 * Sign-In path and the backend already runs the real OAuth code exchange server-side.
 * This module only opens a browser tab and reads the resulting bearer token back.
 */
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import type { MobileSessionResponse } from "character-chatbot-shared";
import { API_BASE_URL, apiFetch } from "./api";
import { clearAuthToken, setAuthToken } from "./authToken";

export { loadAuthToken, getCachedAuthToken } from "./authToken";

export type SignInResult = { ok: true } | { ok: false; error: string };

/**
 * Opens the backend's Google sign-in bridge in a browser tab and persists the bearer
 * token it redirects back with. `error: "cancelled"` means the user closed the tab
 * without completing sign-in — not a real failure.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  const redirectUri = Linking.createURL("auth");
  const startUrl = `${API_BASE_URL}/api/auth/mobile-google-start?redirect_uri=${encodeURIComponent(redirectUri)}`;

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

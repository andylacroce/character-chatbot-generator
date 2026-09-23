/**
 * Bearer token cache/storage, split out from auth.ts so api.ts can read the current
 * token synchronously (for the Authorization header) without importing auth.ts itself
 * — auth.ts imports api.ts's apiFetch, so the reverse import would be circular.
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "authToken";

// `undefined` means "not hydrated from SecureStore yet" — distinct from `null`
// ("hydrated, signed out").
let cachedToken: string | null | undefined;

/** Loads the persisted bearer token, hydrating the in-memory cache on first call. */
export async function loadAuthToken(): Promise<string | null> {
  if (cachedToken === undefined) {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  }
  return cachedToken;
}

/** Synchronous read of the cached token — null before `loadAuthToken()` resolves once. */
export function getCachedAuthToken(): string | null {
  return cachedToken ?? null;
}

/** Persists a newly issued bearer token and updates the in-memory cache. */
export async function setAuthToken(token: string): Promise<void> {
  cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/** Clears the persisted and cached bearer token. */
export async function clearAuthToken(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

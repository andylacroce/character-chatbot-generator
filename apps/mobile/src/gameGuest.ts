/**
 * This device's anonymous guessing-game identity, the mobile equivalent of the web's HttpOnly
 * `portrayal-game-guest` cookie: a random 32-byte secret, minted once and kept in secure
 * storage, sent as the `x-game-guest` header on game requests (see the backend's
 * src/utils/gameGuestIdentity.ts). It's what lets a guest's best streak count toward the
 * leaderboard and be claimed later, without a native cookie jar being involved at all.
 */
import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";
import { STORAGE_KEYS } from "character-chatbot-shared";

let cached: Promise<string> | null = null;

/** base64url without padding: 32 bytes -> exactly the 43 characters the backend expects. */
function toBase64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63];
    const count = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < count; j++) out += alphabet[chars[j]];
  }
  return out;
}

/** Returns this device's guest secret, creating and storing it on first use. */
export function getGameGuestId(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      const existing = await SecureStore.getItemAsync(STORAGE_KEYS.gameGuestId);
      if (existing) return existing;
      const created = toBase64Url(getRandomBytes(32));
      await SecureStore.setItemAsync(STORAGE_KEYS.gameGuestId, created);
      return created;
    })();
    // A failed read/write shouldn't poison every later call.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

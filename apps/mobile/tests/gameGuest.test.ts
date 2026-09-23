jest.mock("expo-crypto", () => ({
  getRandomBytes: jest.fn((n: number) => new Uint8Array(n).map((_, i) => i * 7)),
}));

import * as SecureStore from "expo-secure-store";

/** A fresh copy of the module, so its in-memory cache starts empty for each test. */
function loadModule(): typeof import("../src/gameGuest") {
  let mod!: typeof import("../src/gameGuest");
  jest.isolateModules(() => {
    mod = require("../src/gameGuest");
  });
  return mod;
}

describe("getGameGuestId", () => {
  it("mints a 43-character base64url secret once, then reuses it", async () => {
    await SecureStore.deleteItemAsync("chatbot-game-guest-id");
    const { getGameGuestId } = loadModule();
    const first = await getGameGuestId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await getGameGuestId()).toBe(first);
    expect(await SecureStore.getItemAsync("chatbot-game-guest-id")).toBe(first);
  });

  it("reads an existing secret instead of minting a new one", async () => {
    await SecureStore.setItemAsync("chatbot-game-guest-id", "b".repeat(43));
    const { getGameGuestId } = loadModule();
    expect(await getGameGuestId()).toBe("b".repeat(43));
  });

  it("retries after a storage failure", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error("locked"));
    const { getGameGuestId } = loadModule();
    await expect(getGameGuestId()).rejects.toThrow("locked");
    await expect(getGameGuestId()).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

import { STORAGE_KEYS } from "character-chatbot-shared";

// The module caches the token in a module-level variable that's only ever hydrated once
// (`undefined` -> real value), so each test re-imports both it and its `expo-secure-store`
// mock together after `jest.resetModules()` — mixing a stale top-level import of one with a
// freshly re-required instance of the other would silently point at two different mocks.
describe("authToken", () => {
  function freshModules() {
    jest.resetModules();

    const SecureStore = require("expo-secure-store");

    const authToken = require("../src/authToken");
    return { SecureStore, authToken };
  }

  it("returns null before loadAuthToken() has resolved once", async () => {
    const { authToken } = freshModules();
    expect(authToken.getCachedAuthToken()).toBeNull();
  });

  it("hydrates from SecureStore on first loadAuthToken() call", async () => {
    const { SecureStore, authToken } = freshModules();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce("stored-token");

    await expect(authToken.loadAuthToken()).resolves.toBe("stored-token");
    expect(authToken.getCachedAuthToken()).toBe("stored-token");
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.authToken);
  });

  it("only reads SecureStore once across repeated loadAuthToken() calls", async () => {
    const { SecureStore, authToken } = freshModules();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce("stored-token");

    await authToken.loadAuthToken();
    await authToken.loadAuthToken();
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
  });

  it("setAuthToken persists and updates the cache synchronously", async () => {
    const { SecureStore, authToken } = freshModules();
    await authToken.setAuthToken("new-token");
    expect(authToken.getCachedAuthToken()).toBe("new-token");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.authToken, "new-token");
  });

  it("clearAuthToken clears both the cache and SecureStore", async () => {
    const { SecureStore, authToken } = freshModules();
    await authToken.setAuthToken("new-token");
    await authToken.clearAuthToken();
    expect(authToken.getCachedAuthToken()).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.authToken);
  });
});

import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

jest.mock("../src/authToken", () => ({
  setAuthToken: jest.fn(() => Promise.resolve()),
  clearAuthToken: jest.fn(() => Promise.resolve()),
  loadAuthToken: jest.fn(() => Promise.resolve(null)),
  getCachedAuthToken: jest.fn(() => null),
}));

import { getMobileSession, signIn, signOut } from "../src/auth";
import { clearAuthToken, setAuthToken } from "../src/authToken";
import { API_BASE_URL, apiFetch } from "../src/api";

jest.mock("../src/api", () => ({
  ...jest.requireActual("../src/api"),
  apiFetch: jest.fn(),
}));

describe("auth", () => {
  describe("signIn", () => {
    it("returns cancelled when the user dismisses the tab", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "cancel" });
      await expect(signIn()).resolves.toEqual({ ok: false, error: "cancelled" });
    });

    it("returns cancelled on a dismiss result too", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "dismiss" });
      await expect(signIn()).resolves.toEqual({ ok: false, error: "cancelled" });
    });

    it("returns failed on any other non-success result", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "locked" });
      await expect(signIn()).resolves.toEqual({ ok: false, error: "failed" });
    });

    it("returns failed on success with no url", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "success" });
      await expect(signIn()).resolves.toEqual({ ok: false, error: "failed" });
    });

    it("surfaces a backend-reported error query param", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
        type: "success",
        url: "character-chatbot-mobile://auth?error=access_denied",
      });
      (Linking.parse as jest.Mock).mockReturnValueOnce({
        queryParams: { error: "access_denied" },
      });
      await expect(signIn()).resolves.toEqual({ ok: false, error: "access_denied" });
    });

    it("returns missing_token when success carries neither token nor error", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
        type: "success",
        url: "character-chatbot-mobile://auth",
      });
      (Linking.parse as jest.Mock).mockReturnValueOnce({ queryParams: {} });
      await expect(signIn()).resolves.toEqual({ ok: false, error: "missing_token" });
    });

    it("persists the token and returns ok on success", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
        type: "success",
        url: "character-chatbot-mobile://auth?token=abc123",
      });
      (Linking.parse as jest.Mock).mockReturnValueOnce({ queryParams: { token: "abc123" } });

      await expect(signIn()).resolves.toEqual({ ok: true });
      expect(setAuthToken).toHaveBeenCalledWith("abc123");
    });

    it("opens the backend's mobile-auth-start URL with an app-scheme redirect", async () => {
      (Linking.createURL as jest.Mock).mockReturnValueOnce("character-chatbot-mobile://auth");
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "cancel" });

      await signIn();

      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
        `${API_BASE_URL}/api/auth/mobile-auth-start?redirect_uri=${encodeURIComponent(
          "character-chatbot-mobile://auth",
        )}`,
        "character-chatbot-mobile://auth",
      );
    });
  });

  describe("signOut", () => {
    it("clears the persisted token", async () => {
      await signOut();
      expect(clearAuthToken).toHaveBeenCalled();
    });
  });

  describe("getMobileSession", () => {
    it("fetches the mobile session endpoint", async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ userId: null, email: null, name: null });
      await getMobileSession();
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/mobile-session");
    });
  });
});

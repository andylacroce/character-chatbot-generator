jest.mock("../src/authToken", () => ({
  getCachedAuthToken: jest.fn(() => null),
}));

import { getCachedAuthToken } from "../src/authToken";
import {
  ApiError,
  API_BASE_URL,
  apiFetch,
  generateAvatar,
  generatePersonality,
  getChars,
  getPersistedBots,
  getPersistedMessages,
  getRandomCharacter,
  getUserProfile,
  getVoiceConfig,
  persistBot,
  resolveApiUrl,
  saveUserProfile,
  sendChatMessage,
  validateCharacter,
} from "../src/api";

const mockedGetCachedAuthToken = getCachedAuthToken as jest.Mock;

function mockFetchOnce(response: Partial<Response> & { ok: boolean }) {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce(response);
}

describe("api", () => {
  beforeEach(() => {
    mockedGetCachedAuthToken.mockReturnValue(null);
  });

  describe("apiFetch", () => {
    it("GETs without an x-api-key header", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ hello: "world" }) } as Response);
      const result = await apiFetch("/api/health");
      expect(result).toEqual({ hello: "world" });
      const [url, options] = (globalThis.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${API_BASE_URL}/api/health`);
      expect((options.headers as Record<string, string>)["x-api-key"]).toBeUndefined();
    });

    it("sends x-api-key on a non-GET request", async () => {
      mockFetchOnce({ ok: true, json: async () => ({}) } as Response);
      await apiFetch("/api/bots", { method: "POST", body: "{}" });
      const [, options] = (globalThis.fetch as jest.Mock).mock.calls[0];
      expect((options.headers as Record<string, string>)["x-api-key"]).toBe("test-secret");
    });

    it("attaches Authorization when a token is cached", async () => {
      mockedGetCachedAuthToken.mockReturnValue("tok_123");
      mockFetchOnce({ ok: true, json: async () => ({}) } as Response);
      await apiFetch("/api/bots");
      const [, options] = (globalThis.fetch as jest.Mock).mock.calls[0];
      expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok_123");
    });

    it("omits Authorization when no token is cached", async () => {
      mockFetchOnce({ ok: true, json: async () => ({}) } as Response);
      await apiFetch("/api/bots");
      const [, options] = (globalThis.fetch as jest.Mock).mock.calls[0];
      expect((options.headers as Record<string, string>)["Authorization"]).toBeUndefined();
    });

    it("throws ApiError with the response body text on a non-ok response", async () => {
      mockFetchOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => "rate limited",
      } as Response);
      await expect(apiFetch("/api/chat")).rejects.toMatchObject(new ApiError(429, "rate limited"));
    });

    it("falls back to statusText when the error body can't be read", async () => {
      mockFetchOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
        text: () => Promise.reject(new Error("stream closed")),
      } as unknown as Response);
      await expect(apiFetch("/api/chat")).rejects.toMatchObject(new ApiError(500, "Server Error"));
    });
  });

  describe("resolveApiUrl", () => {
    it("returns an already-absolute URL unchanged", () => {
      expect(resolveApiUrl("https://blob.example.com/a.png")).toBe(
        "https://blob.example.com/a.png",
      );
    });

    it("prefixes a backend-relative path with API_BASE_URL", () => {
      expect(resolveApiUrl("/audio/foo.mp3")).toBe(`${API_BASE_URL}/audio/foo.mp3`);
    });
  });

  describe("validateCharacter", () => {
    it("returns the parsed result on success", async () => {
      mockFetchOnce({
        ok: true,
        json: async () => ({
          characterName: "Sherlock Holmes",
          isPublicDomain: true,
          isSafe: true,
          warningLevel: "none",
        }),
      } as Response);
      const result = await validateCharacter("Sherlock Holmes");
      expect(result.warningLevel).toBe("none");
    });

    it("fails open (safe/unblocked/recognized) when the request throws", async () => {
      (globalThis.fetch as jest.Mock).mockRejectedValueOnce(new Error("network down"));
      const result = await validateCharacter("Anyone");
      expect(result).toEqual({
        characterName: "Anyone",
        isPublicDomain: true,
        isSafe: true,
        warningLevel: "none",
      });
    });
  });

  describe("thin POST/GET wrappers", () => {
    it("generatePersonality posts to /api/generate-personality", async () => {
      mockFetchOnce({
        ok: true,
        json: async () => ({ personality: "p", correctedName: "n" }),
      } as Response);
      await generatePersonality({ name: "Zeus" });
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
        `${API_BASE_URL}/api/generate-personality`,
      );
    });

    it("generateAvatar posts to /api/generate-avatar", async () => {
      mockFetchOnce({
        ok: true,
        json: async () => ({ avatarUrl: null, gender: null }),
      } as Response);
      await generateAvatar({ name: "Zeus" });
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
        `${API_BASE_URL}/api/generate-avatar`,
      );
    });

    it("getVoiceConfig includes gender only when given", async () => {
      mockFetchOnce({ ok: true, json: async () => ({}) } as Response);
      await getVoiceConfig("Zeus", "male");
      const body = JSON.parse((globalThis.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body).toEqual({ name: "Zeus", gender: "male" });
    });

    it("getVoiceConfig omits gender when not given", async () => {
      mockFetchOnce({ ok: true, json: async () => ({}) } as Response);
      await getVoiceConfig("Zeus");
      const body = JSON.parse((globalThis.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body).toEqual({ name: "Zeus" });
    });

    it("sendChatMessage posts to /api/chat", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ reply: "hi", done: true }) } as Response);
      await sendChatMessage({ name: "Zeus", personality: "p", message: "hi" } as never);
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(`${API_BASE_URL}/api/chat`);
    });

    it("getRandomCharacter GETs /api/random-character", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ name: "Zeus" }) } as Response);
      await getRandomCharacter();
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
        `${API_BASE_URL}/api/random-character`,
      );
    });

    it("getChars builds the limit/offset query string", async () => {
      mockFetchOnce({
        ok: true,
        json: async () => ({ characters: [], hasMore: false }),
      } as Response);
      await getChars(20, 40);
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
        `${API_BASE_URL}/api/chars?limit=20&offset=40`,
      );
    });

    it("getPersistedBots unwraps the bots array", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ bots: [{ name: "Zeus" }] }) } as Response);
      await expect(getPersistedBots()).resolves.toEqual([{ name: "Zeus" }]);
    });

    it("persistBot posts the bot payload to /api/bots", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ persisted: true }) } as Response);
      await persistBot({
        name: "Zeus",
        personality: "p",
        avatarUrl: null,
        gender: null,
        voiceConfig: null,
      });
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(`${API_BASE_URL}/api/bots`);
    });

    it("getPersistedMessages unwraps and encodes the bot name", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ messages: [] }) } as Response);
      await getPersistedMessages("Zeus & Hera");
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
        `${API_BASE_URL}/api/messages?botName=Zeus%20%26%20Hera`,
      );
    });

    it("getUserProfile GETs /api/user-profile", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ preferredName: null }) } as Response);
      await getUserProfile();
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
        `${API_BASE_URL}/api/user-profile`,
      );
    });

    it("saveUserProfile posts the name", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ persisted: true }) } as Response);
      await saveUserProfile("Andy");
      const body = JSON.parse((globalThis.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body).toEqual({ name: "Andy" });
    });
  });
});

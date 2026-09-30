jest.mock("../src/authToken", () => ({
  getCachedAuthToken: jest.fn(() => null),
}));
jest.mock("../src/gameGuest", () => ({
  getGameGuestId: jest.fn(() => Promise.resolve("g".repeat(43))),
}));

import { GUESS_WHO, GUESS_WHO_NEXT } from "character-chatbot-shared";
import { getCachedAuthToken } from "../src/authToken";
import {
  ApiError,
  API_BASE_URL,
  apiErrorMessage,
  apiFetch,
  gameTransport,
  getLeaderboard,
  getLeaderboardSettings,
  saveLeaderboardSettings,
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

    it("getChars builds the limit/offset/sort/group query string", async () => {
      mockFetchOnce({
        ok: true,
        json: async () => ({ characters: [], hasMore: false }),
      } as Response);
      await getChars(20, 40);
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
        `${API_BASE_URL}/api/chars?limit=20&offset=40&sort=newest&group=none`,
      );

      mockFetchOnce({
        ok: true,
        json: async () => ({ characters: [], hasMore: false }),
      } as Response);
      await getChars(20, 40, "name-asc", "category");
      expect((globalThis.fetch as jest.Mock).mock.calls[1][0]).toBe(
        `${API_BASE_URL}/api/chars?limit=20&offset=40&sort=name-asc&group=category`,
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
      mockFetchOnce({ ok: true, json: async () => ({ name: null }) } as Response);
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

  describe.each([GUESS_WHO, GUESS_WHO_NEXT])("$title requests", (game) => {
    const { slug, tokenField } = game;
    const transport = gameTransport(game);
    const round = {
      [tokenField]: "t1",
      currentCharacterName: "Zeus",
      reply: "Hail.",
      streak: 0,
    };

    function lastCall() {
      const calls = (globalThis.fetch as jest.Mock).mock.calls;
      const [url, options] = calls[calls.length - 1];
      return { url, options, headers: options.headers as Record<string, string> };
    }

    it("starts and continues rounds in plain JSON mode with the guest identity and the game's wire token name", async () => {
      mockFetchOnce({ ok: true, json: async () => round } as Response);
      await expect(transport.start()).resolves.toMatchObject({ token: "t1", reply: "Hail." });
      let call = lastCall();
      expect(call.url).toBe(`${API_BASE_URL}/api/${slug}/start`);
      expect(JSON.parse(call.options.body)).toEqual({});
      expect(call.headers["x-game-guest"]).toBe("g".repeat(43));

      mockFetchOnce({ ok: true, json: async () => round } as Response);
      await transport.continueRound("t1");
      call = lastCall();
      expect(call.url).toBe(`${API_BASE_URL}/api/${slug}/continue`);
      expect(JSON.parse(call.options.body)).toEqual({ [tokenField]: "t1" });
    });

    it("rejects a malformed round", async () => {
      mockFetchOnce({ ok: true, json: async () => ({}) } as Response);
      await expect(transport.start()).rejects.toThrow(`Invalid response from /api/${slug}/start`);
    });

    it("sends turns, give-ups and the high score to this game's routes", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ reply: "Hi" }) } as Response);
      await transport.sendMessage({ token: "t1", message: "Hi" });
      expect(lastCall().url).toBe(`${API_BASE_URL}/api/${slug}/message`);
      expect(JSON.parse(lastCall().options.body)).toMatchObject({
        [tokenField]: "t1",
        message: "Hi",
      });

      mockFetchOnce({ ok: true, json: async () => ({}) } as Response);
      await transport.giveUp("t1");
      expect(lastCall().url).toBe(`${API_BASE_URL}/api/${slug}/give-up`);
      expect(JSON.parse(lastCall().options.body)).toEqual({ [tokenField]: "t1" });

      mockFetchOnce({ ok: true, json: async () => ({ highScore: 3 }) } as Response);
      await expect(transport.getHighScore()).resolves.toEqual({ highScore: 3 });
      expect(lastCall().url).toBe(`${API_BASE_URL}/api/${slug}/high-score`);
      expect(lastCall().headers["x-game-guest"]).toBe("g".repeat(43));
    });

    it("reads the public leaderboard without the guest header, and reads/saves leaderboard settings with it", async () => {
      mockFetchOnce({ ok: true, json: async () => ({ entries: [] }) } as Response);
      await getLeaderboard(game);
      expect(lastCall().url).toBe(`${API_BASE_URL}/api/${slug}/leaderboard`);

      mockFetchOnce({ ok: true, json: async () => ({}) } as Response);
      await getLeaderboardSettings(game);
      expect(lastCall().url).toBe(`${API_BASE_URL}/api/${slug}/leaderboard-settings`);
      expect(lastCall().options.method).toBeUndefined();
      expect(lastCall().headers["x-game-guest"]).toBe("g".repeat(43));

      mockFetchOnce({ ok: true, json: async () => ({}) } as Response);
      await saveLeaderboardSettings(game, { showOnLeaderboard: false });
      expect(lastCall().options.method).toBe("POST");
    });
  });

  it("apiErrorMessage extracts the server's reason, else falls back", () => {
    expect(apiErrorMessage(new ApiError(400, '{"error":"Bad name"}'), "x")).toBe("Bad name");
    expect(apiErrorMessage(new ApiError(500, "<html>"), "fallback")).toBe("fallback");
    expect(apiErrorMessage(new Error("net"), "fallback")).toBe("fallback");
  });
});

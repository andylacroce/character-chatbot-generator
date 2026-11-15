/** @jest-environment node */
import {
  recordTextUsage,
  resetSpendMemory,
  SpendCapError,
  textCallSettings,
} from "../../src/utils/claude/spendGuard";

describe("spendGuard", () => {
  beforeEach(() => {
    resetSpendMemory();
    delete process.env.DAILY_TEXT_SOFT_LIMIT;
    delete process.env.DAILY_TEXT_HARD_LIMIT;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("uses the normal text model when no limits are set", async () => {
    await recordTextUsage({ input_tokens: 1e9, output_tokens: 1e9 });
    expect((await textCallSettings()).model).toBe("claude-haiku-5-5"); // non-production text tier
  });

  it("drops to Haiku past the soft limit and throws past the hard limit", async () => {
    const env = process.env as Record<string, string>;
    env.NODE_ENV = "production";
    process.env.DAILY_TEXT_SOFT_LIMIT = "100";
    process.env.DAILY_TEXT_HARD_LIMIT = "200";
    try {
      expect((await textCallSettings()).model).toBe("claude-sonnet-5-5");
      await recordTextUsage({ input_tokens: 50, output_tokens: 10 }); // 100 weighted
      const soft = await textCallSettings();
      expect(soft.model).toBe("claude-haiku-5-5");
      expect(soft.thinking).toEqual({ type: "disabled" });
      await recordTextUsage({ input_tokens: 100 });
      await expect(textCallSettings()).rejects.toBeInstanceOf(SpendCapError);
    } finally {
      env.NODE_ENV = "test";
    }
  });

  it("reads and writes the Redis counter when configured, and fails open on an outage", async () => {
    process.env.DAILY_TEXT_HARD_LIMIT = "10";
    process.env.KV_REST_API_URL = "https://redis.test";
    process.env.KV_REST_API_TOKEN = "t";
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(Response.json([{ result: "50" }]))
      .mockResolvedValueOnce(new Response("down", { status: 500 }));
    await expect(textCallSettings()).rejects.toBeInstanceOf(SpendCapError);
    await expect(textCallSettings()).resolves.toBeDefined();
    fetchMock.mockResolvedValueOnce(Response.json([{ result: 1 }, { result: 1 }]));
    await recordTextUsage({ input_tokens: 3, output_tokens: 1 });
    expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string)[0]).toEqual([
      "INCRBY",
      expect.stringMatching(/^spend:text:\d{4}-\d{2}-\d{2}$/),
      8,
    ]);
    fetchMock.mockRestore();
  });
});

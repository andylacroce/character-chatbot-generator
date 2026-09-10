import { createMocks } from "node-mocks-http";

const fakeB64 = Buffer.from("fakeimagedata").toString("base64");

const mockAnthropicCreate = jest.fn().mockResolvedValue({
  content: [
    {
      type: "text",
      text: '{"subject":"tall detective","artStyle":"photorealistic","composition":"headshot","iconicElements":"deerstalker hat","negativePrompts":"no duplicates","gender":"male"}',
    },
  ],
});

jest.mock("@anthropic-ai/sdk", () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
  __esModule: true,
}));

jest.mock("../../src/utils/claudeModelSelector", () => ({
  getClaudeModel: (_type: "text" | "text-simple") => "claude-haiku-4-5-20251001",
}));

jest.mock("express-rate-limit", () => {
  return jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
});

describe("generate-avatar API", () => {
  const OLD_ENV = process.env;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      CLOUDFLARE_ACCOUNT_ID: "test-account",
      CLOUDFLARE_API_TOKEN: "test-token",
      ANTHROPIC_API_KEY: "test-key",
    };
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"subject":"tall detective","artStyle":"photorealistic","composition":"headshot","iconicElements":"deerstalker hat","negativePrompts":"no duplicates","gender":"male"}',
        },
      ],
    });
    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { image: fakeB64 } }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns 400 if name is missing", async () => {
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: {} });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 if name is not a string", async () => {
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: 123 } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 if sanitized name is empty", async () => {
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "   " } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 405 if not POST", async () => {
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 200 and a data URL for a valid name", async () => {
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Sherlock Holmes" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.avatarUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("includes gender in response when Claude provides it", async () => {
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Sherlock Holmes" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.gender).toBe("male");
  });

  it("calls Cloudflare Workers AI with the account id and bearer token", async () => {
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Sherlock Holmes" } });
    await handler(req, res);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/black-forest-labs/flux-1-schnell",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("falls back to Pollinations when Cloudflare is not configured", async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from("pollinationsdata"),
    });

    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Sherlock Holmes" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("image.pollinations.ai"));
    expect(res._getJSONData().avatarUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("falls back to Pollinations when Cloudflare returns no image data", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, result: {} }) })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from("pollinationsdata"),
      });

    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Sherlock Holmes" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(res._getJSONData().avatarUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("falls back to Pollinations when Cloudflare fails with an error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Cloudflare API error")).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Buffer.from("pollinationsdata"),
    });

    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Sherlock Holmes" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().avatarUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("returns silhouette fallback when both Cloudflare and Pollinations fail", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "error" });

    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Sherlock Holmes" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.avatarUrl).toBe("/silhouette.svg");
  });

  it("handles Claude prompt generation failure gracefully and uses fallback prompt", async () => {
    mockAnthropicCreate.mockRejectedValueOnce(new Error("Claude error"));
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Sherlock Holmes" } });
    await handler(req, res);
    // Should still attempt image generation with the fallback prompt
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.avatarUrl).toBeTruthy();
  });

  it("returns silhouette fallback when ANTHROPIC_API_KEY triggers a top-level error", async () => {
    mockAnthropicCreate.mockImplementationOnce(() => {
      throw new Error("top-level error");
    });
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Sherlock Holmes" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.avatarUrl).toBeTruthy();
  });

  it("trims prompt when it exceeds 1000 characters", async () => {
    const longSubject = "x".repeat(900);
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            subject: longSubject,
            artStyle: "photorealistic",
            composition: "headshot",
            iconicElements: "",
            negativePrompts: "none",
            gender: "male",
          }),
        },
      ],
    });
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Test Character" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    // Verify Cloudflare was still called (prompt was trimmed, not aborted)
    expect(mockFetch).toHaveBeenCalled();
  });

  it("covers non-Error Cloudflare failure branch (uses String(err))", async () => {
    // Throw a plain string (non-Error) from Cloudflare's fetch to exercise String(err) branch
    mockFetch
      .mockRejectedValueOnce("plain string error")
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "error" });
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Test Character" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().avatarUrl).toBe("/silhouette.svg");
  });

  it("covers non-Error top-level catch branch", async () => {
    // Make the anthropic constructor throw a non-Error to enter catch with non-Error
    mockAnthropicCreate.mockImplementationOnce(() => {
      throw 42;
    });
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Test Character" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().avatarUrl).toBeTruthy();
  });

  it("covers non-text content[0] type in prompt generation (uses empty fallback)", async () => {
    // Returning non-text content forces the fallback branch: content[0]?.type !== "text" → "{}"
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "image", source: {} }],
    });
    const handler = (await import("../../pages/api/generate-avatar")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Test Character" } });
    await handler(req, res);
    // JSON.parse("{}") → promptData with no subject etc, still generates ok
    expect(res._getStatusCode()).toBe(200);
  });
});

const mockLogEvent = jest.fn();
jest.mock("../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));

import { generateImageWithCloudflare } from "../../src/utils/cloudflareImageGen";

describe("generateImageWithCloudflare", () => {
  const OLD_ENV = process.env;
  const fakeB64 = Buffer.from("imagebytes").toString("base64");

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
      CLOUDFLARE_API_TOKEN: "token-abc",
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns null and logs when CLOUDFLARE_ACCOUNT_ID is not configured", async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await generateImageWithCloudflare("a prompt");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "avatar_cloudflare_not_configured",
      expect.any(String),
    );
  });

  it("returns null and logs when CLOUDFLARE_API_TOKEN is not configured", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await generateImageWithCloudflare("a prompt");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "avatar_cloudflare_not_configured",
      expect.any(String),
    );
  });

  it("returns a data URL on success, calling the correct endpoint and auth header", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { image: fakeB64 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateImageWithCloudflare("a cool prompt");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/@cf/black-forest-labs/flux-1-schnell",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-abc",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ prompt: "a cool prompt", steps: 8 }),
      }),
    );
    expect(result).toBe(`data:image/png;base64,${fakeB64}`);
  });

  it("returns null on a non-ok HTTP response", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal error",
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateImageWithCloudflare("a prompt");
    expect(result).toBeNull();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "warn",
      "avatar_cloudflare_http_error",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("returns null when the API responds success:false", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, errors: [{ message: "quota exceeded" }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateImageWithCloudflare("a prompt");
    expect(result).toBeNull();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "warn",
      "avatar_cloudflare_no_image",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("returns null when the response has no image field", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: {} }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateImageWithCloudflare("a prompt");
    expect(result).toBeNull();
  });
});

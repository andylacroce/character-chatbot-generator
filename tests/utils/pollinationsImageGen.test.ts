const mockLogEvent = jest.fn();
jest.mock("../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));

import { generateImageWithPollinations } from "../../src/utils/pollinationsImageGen";

describe("generateImageWithPollinations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a data URL on success, calling the Pollinations endpoint with the encoded prompt", async () => {
    const bytes = Buffer.from("imagebytes");
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateImageWithPollinations("a cool prompt");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("image.pollinations.ai/prompt/a%20cool%20prompt"),
    );
    expect(result).toBe(`data:image/png;base64,${bytes.toString("base64")}`);
  });

  it("returns null on a non-ok HTTP response", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateImageWithPollinations("a prompt");
    expect(result).toBeNull();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "warn",
      "avatar_pollinations_http_error",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("returns null when the response body is empty", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateImageWithPollinations("a prompt");
    expect(result).toBeNull();
    expect(mockLogEvent).toHaveBeenCalledWith(
      "warn",
      "avatar_pollinations_empty",
      expect.any(String),
    );
  });
});

import type { NextApiRequest, NextApiResponse } from "next";

const mockGetVoiceConfig = jest.fn();
jest.mock("../../../src/utils/characterVoices", () => ({
  getVoiceConfigForCharacter: (...args: unknown[]) => mockGetVoiceConfig(...args),
}));

import handler from "../../../src/pages/api/get-voice-config";

function makeRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = jest.fn().mockReturnValue(res as NextApiResponse);
  res.json = jest.fn().mockReturnValue(res as NextApiResponse);
  res.end = jest.fn().mockReturnValue(res as NextApiResponse);
  res.send = jest.fn(() => {
    (res as { headersSent: boolean }).headersSent = true;
    return res as NextApiResponse;
  });
  res.setHeader = jest.fn();
  res.getHeader = jest.fn();
  return res as NextApiResponse;
}

function makeReq(body: unknown, method = "POST", ip = "203.0.113.7") {
  return { method, body, headers: { "x-forwarded-for": ip } } as unknown as NextApiRequest;
}

describe("get-voice-config API", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rate limits a caller to 20 requests a minute before reaching Claude", async () => {
    mockGetVoiceConfig.mockResolvedValue({});
    for (let i = 0; i < 20; i++) {
      await handler(makeReq({ name: "Ada" }, "POST", "198.51.100.99"), makeRes());
    }
    const res = makeRes();
    await handler(makeReq({ name: "Ada" }, "POST", "198.51.100.99"), res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(mockGetVoiceConfig).toHaveBeenCalledTimes(20);
  });

  it("returns 405 for non-POST methods", async () => {
    const res = makeRes();
    await handler(makeReq({}, "GET"), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockGetVoiceConfig).not.toHaveBeenCalled();
  });

  it("returns 400 when the name is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ gender: "female" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Name required" });
  });

  it("returns the resolved voice config", async () => {
    const config = { languageCode: "en-US", name: "en-US-Studio-O", ssmlGender: "FEMALE" };
    mockGetVoiceConfig.mockResolvedValueOnce(config);
    const res = makeRes();
    await handler(
      makeReq({
        name: "Ada Lovelace",
        gender: "female",
        voiceContext: "Formal, analytical, and quietly enthusiastic.",
      }),
      res,
    );

    expect(mockGetVoiceConfig).toHaveBeenCalledWith(
      "Ada Lovelace",
      "female",
      "Formal, analytical, and quietly enthusiastic.",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(config);
  });

  it("returns 500 when voice lookup throws", async () => {
    mockGetVoiceConfig.mockRejectedValueOnce(new Error("upstream down"));
    const res = makeRes();
    await handler(makeReq({ name: "Ada Lovelace" }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to get voice config" });
  });
});

import type { NextApiRequest, NextApiResponse } from "next";

const mockLogEvent = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));

const mockGeneratePersonalityPrompt = jest.fn();
jest.mock("../../../src/config/serverConfig", () => ({
  generatePersonalityPrompt: (...args: unknown[]) => mockGeneratePersonalityPrompt(...args),
}));

const mockGetSessionUserId = jest.fn().mockResolvedValue(null);
jest.mock("../../../src/utils/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockRecordEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

const mockLimit = jest.fn().mockResolvedValue([]);
const mockOrderBy = jest.fn(() => ({ limit: mockLimit }));
const mockFrom = jest.fn(() => ({ orderBy: mockOrderBy }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));
jest.mock("../../../src/db/client", () => ({ getDb: () => ({ select: mockSelect }) }));

import handler from "../../../pages/api/generate-personality";

function makeRes() {
  const res: Partial<NextApiResponse> = { headersSent: false };
  res.status = jest.fn().mockReturnValue(res as NextApiResponse);
  res.json = jest.fn().mockReturnValue(res as NextApiResponse);
  res.end = jest.fn().mockReturnValue(res as NextApiResponse);
  res.setHeader = jest.fn();
  return res as NextApiResponse;
}

function makeReq(body: unknown, method = "POST") {
  return {
    method,
    body,
    headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250) + 1}` },
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as NextApiRequest;
}

describe("generate-personality API", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 405 for non-POST methods", async () => {
    const res = makeRes();
    await handler(makeReq({}, "GET"), res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockGeneratePersonalityPrompt).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing name", {}],
    ["a non-string name", { name: 42 }],
    ["an empty name", { name: "" }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = makeRes();
    await handler(makeReq(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Valid name required" });
  });

  it("returns 400 when sanitizing strips the name to nothing", async () => {
    // sanitizeCharacterName removes < > ' " & — a name made only of those is empty after.
    const res = makeRes();
    await handler(makeReq({ name: '<<>>&"' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid character name" });
    expect(mockGeneratePersonalityPrompt).not.toHaveBeenCalled();
  });

  it("returns the generated personality and the sanitized name", async () => {
    mockGeneratePersonalityPrompt.mockResolvedValueOnce({
      prompt: "You are Ada Lovelace.",
      correctedName: "Ada Lovelace",
    });
    const res = makeRes();
    await handler(makeReq({ name: "  Ada Lovelace  " }), res);

    // No DATABASE_URL configured in this test env, so fetchExistingCharacterNames
    // degrades to [] rather than touching a real DB.
    expect(mockGeneratePersonalityPrompt).toHaveBeenCalledWith("Ada Lovelace", undefined, []);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      personality: "You are Ada Lovelace.",
      correctedName: "Ada Lovelace",
    });
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "bot_created",
      { hasDescription: false, guest: true },
      null,
    );
  });

  it("returns Claude's fuzzy-matched correctedName when it differs from the input", async () => {
    mockGeneratePersonalityPrompt.mockResolvedValueOnce({
      prompt: "You are Sherlock Holmes.",
      correctedName: "Sherlock Holmes",
    });
    const res = makeRes();
    await handler(makeReq({ name: "sherlok holmes" }), res);

    expect(res.json).toHaveBeenCalledWith({
      personality: "You are Sherlock Holmes.",
      correctedName: "Sherlock Holmes",
    });
  });

  it("records the creator as signed-in when a session is present", async () => {
    mockGetSessionUserId.mockResolvedValueOnce("user-1");
    mockGeneratePersonalityPrompt.mockResolvedValueOnce({
      prompt: "You are Ada Lovelace.",
      correctedName: "Ada Lovelace",
    });
    const res = makeRes();
    await handler(makeReq({ name: "Ada Lovelace", description: "A mathematician" }), res);

    expect(mockRecordEvent).toHaveBeenCalledWith(
      "bot_created",
      { hasDescription: true, guest: false },
      "user-1",
    );
  });

  it("returns 500 and logs when generation throws", async () => {
    mockGeneratePersonalityPrompt.mockRejectedValueOnce(new Error("claude exploded"));
    const res = makeRes();
    await handler(makeReq({ name: "Ada Lovelace" }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to generate personality prompt" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "personality_prompt_error",
      expect.any(String),
      expect.objectContaining({ error: "claude exploded" }),
    );
  });

  it("stops after the rate limiter has already responded", async () => {
    const res = makeRes();
    (res as { headersSent: boolean }).headersSent = true;
    await handler(makeReq({ name: "Ada Lovelace" }), res);

    expect(mockGeneratePersonalityPrompt).not.toHaveBeenCalled();
  });

  describe("fuzzy-matching against existing characters (DATABASE_URL configured)", () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
    });

    afterAll(() => {
      process.env = OLD_ENV;
    });

    it("passes existing display names (falling back to characterName) to generatePersonalityPrompt", async () => {
      mockLimit.mockResolvedValueOnce([
        { characterName: "sherlock holmes", displayName: "Sherlock Holmes" },
        { characterName: "cleopatra", displayName: null },
      ]);
      mockGeneratePersonalityPrompt.mockResolvedValueOnce({
        prompt: "You are Sherlock Holmes.",
        correctedName: "Sherlock Holmes",
      });
      const res = makeRes();
      await handler(makeReq({ name: "sherlok holmes" }), res);

      expect(mockGeneratePersonalityPrompt).toHaveBeenCalledWith("sherlok holmes", undefined, [
        "Sherlock Holmes",
        "cleopatra",
      ]);
    });

    it("degrades to an empty list when the existing-names lookup fails", async () => {
      mockLimit.mockRejectedValueOnce(new Error("db down"));
      mockGeneratePersonalityPrompt.mockResolvedValueOnce({
        prompt: "You are Ada Lovelace.",
        correctedName: "Ada Lovelace",
      });
      const res = makeRes();
      await handler(makeReq({ name: "Ada Lovelace" }), res);

      expect(mockGeneratePersonalityPrompt).toHaveBeenCalledWith("Ada Lovelace", undefined, []);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});

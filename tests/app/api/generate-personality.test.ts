/** @jest-environment node */
import { asHandler } from "../../helpers/asHandler";
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
jest.mock("../../../src/utils/account/getSessionUserId", () => ({
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

const mockIsAllowlisted = jest.fn();
jest.mock("../../../src/utils/moderation/characterAllowlist", () => ({
  isAllowlisted: (...args: unknown[]) => mockIsAllowlisted(...args),
}));
const mockGetBlocklistEntry = jest.fn();
jest.mock("../../../src/utils/moderation/characterBlocklist", () => ({
  getBlocklistEntry: (...args: unknown[]) => mockGetBlocklistEntry(...args),
}));
const mockGetCachedAvatar = jest.fn();
jest.mock("../../../src/utils/avatar/avatarCache", () => ({
  getCachedAvatar: (...args: unknown[]) => mockGetCachedAvatar(...args),
}));
const mockClassify = jest.fn();
jest.mock("../../../src/utils/moderation/characterClassifier", () => ({
  classifyCharacterName: (...args: unknown[]) => mockClassify(...args),
}));

import { signPersona } from "../../../src/utils/chat/personaSignature";
import * as route from "../../../src/app/api/generate-personality/route";
const handler = asHandler(route);

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
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PERSONA_SECRET = "test-persona-secret";
    mockIsAllowlisted.mockResolvedValue(false);
    mockGetBlocklistEntry.mockResolvedValue(null);
    mockGetCachedAvatar.mockResolvedValue(null);
    mockClassify.mockResolvedValue({ blocked: false });
  });
  afterAll(() => {
    delete process.env.PERSONA_SECRET;
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
    expect(mockGeneratePersonalityPrompt).toHaveBeenCalledWith("Ada Lovelace", []);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      personality: "You are Ada Lovelace.",
      correctedName: "Ada Lovelace",
      personalitySignature: signPersona("Ada Lovelace", "You are Ada Lovelace."),
    });
    expect(mockRecordEvent).toHaveBeenCalledWith("bot_created", { guest: true }, null);
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
      personalitySignature: signPersona("Sherlock Holmes", "You are Sherlock Holmes."),
    });
  });

  describe("name gate", () => {
    const okPrompt = { prompt: "You are X.", correctedName: "X" };

    it("refuses a content-blocklisted name before any Claude call", async () => {
      mockGetBlocklistEntry.mockResolvedValue({ category: "content" });
      const res = makeRes();
      await handler(makeReq({ name: "X" }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "This character isn't available" });
      expect(mockGeneratePersonalityPrompt).not.toHaveBeenCalled();
      expect(mockClassify).not.toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith(
        "info",
        "personality_gate_refused",
        expect.any(String),
        { reason: "blocked" },
      );
    });

    it("allows and signs a copyright-blocklisted name (private Continue Anyway path)", async () => {
      mockGetBlocklistEntry.mockResolvedValue({ category: "copyright" });
      mockGeneratePersonalityPrompt.mockResolvedValueOnce(okPrompt);
      const res = makeRes();
      await handler(makeReq({ name: "X" }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ personalitySignature: signPersona("X", "You are X.") }),
      );
    });

    it("skips the classifier for an allowlisted or already-cached name", async () => {
      mockGeneratePersonalityPrompt.mockResolvedValue(okPrompt);
      mockIsAllowlisted.mockResolvedValueOnce(true);
      await handler(makeReq({ name: "X" }), makeRes());
      mockGetCachedAvatar.mockResolvedValueOnce({ avatarUrl: "/a.png", gender: null });
      await handler(makeReq({ name: "X" }), makeRes());

      expect(mockClassify).not.toHaveBeenCalled();
      expect(mockGeneratePersonalityPrompt).toHaveBeenCalledTimes(2);
    });

    it("refuses a name the classifier blocks, without a Claude personality call", async () => {
      mockClassify.mockResolvedValue({ blocked: true });
      const res = makeRes();
      await handler(makeReq({ name: "X" }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockGeneratePersonalityPrompt).not.toHaveBeenCalled();
    });

    it("fails closed with a 503 when the classifier errors", async () => {
      mockClassify.mockRejectedValue(new Error("down"));
      const res = makeRes();
      await handler(makeReq({ name: "X" }), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(mockGeneratePersonalityPrompt).not.toHaveBeenCalled();
    });

    it("signs the sanitized returned name, including the server's own fallback prompt", async () => {
      mockGeneratePersonalityPrompt.mockResolvedValueOnce({
        prompt: "You are D'Artagnan. Stay in character.",
        correctedName: "D'Artagnan <b>",
        recognized: true,
        fallback: true,
      });
      const res = makeRes();
      await handler(makeReq({ name: "D'Artagnan" }), res);

      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.correctedName).toBe("DArtagnan b");
      expect(body.personalitySignature).toBe(signPersona("DArtagnan b", body.personality));
    });

    it("omits the signature when no key is configured", async () => {
      delete process.env.PERSONA_SECRET;
      mockGeneratePersonalityPrompt.mockResolvedValueOnce(okPrompt);
      const res = makeRes();
      await handler(makeReq({ name: "X" }), res);

      expect((res.json as jest.Mock).mock.calls[0][0]).not.toHaveProperty("personalitySignature");
    });
  });

  it("rejects an unrecognized name without recording a created bot", async () => {
    mockGeneratePersonalityPrompt.mockResolvedValueOnce({
      prompt: "unused",
      correctedName: "Captain Moonbeam",
      recognized: false,
    });
    const res = makeRes();
    await handler(makeReq({ name: "Captain Moonbeam" }), res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: "Choose a character or person from history or fiction.",
    });
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it("records the creator as signed-in when a session is present", async () => {
    mockGetSessionUserId.mockResolvedValueOnce("user-1");
    mockGeneratePersonalityPrompt.mockResolvedValueOnce({
      prompt: "You are Ada Lovelace.",
      correctedName: "Ada Lovelace",
    });
    const res = makeRes();
    await handler(makeReq({ name: "Ada Lovelace" }), res);

    expect(mockRecordEvent).toHaveBeenCalledWith("bot_created", { guest: false }, "user-1");
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

      expect(mockGeneratePersonalityPrompt).toHaveBeenCalledWith("sherlok holmes", [
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

      expect(mockGeneratePersonalityPrompt).toHaveBeenCalledWith("Ada Lovelace", []);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});

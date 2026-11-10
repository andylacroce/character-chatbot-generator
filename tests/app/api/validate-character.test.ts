/** @jest-environment node */
import { asHandler } from "../../helpers/asHandler";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock logger
const mockLogEvent = jest.fn();
const mockSanitize = jest.fn((m: unknown) => m);
jest.mock("../../../src/utils/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
  sanitizeLogMeta: (m: unknown) => mockSanitize(m),
}));

// Mock @anthropic-ai/sdk to control responses
const mockCreate = jest.fn();
jest.mock("@anthropic-ai/sdk", () => ({
  default: function AnthropicMock() {
    return { messages: { create: mockCreate } };
  },
  __esModule: true,
}));

// Mock model selector
jest.mock("../../../src/utils/claude/claudeModelSelector", () => ({
  getClaudeModel: (_: string) => "claude-test",
}));

// Now that mocks are set up, require the handler module
const handler = asHandler(require("../../../src/app/api/validate-character/route"));

function makeRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = jest.fn().mockReturnValue(res as NextApiResponse);
  res.json = jest.fn().mockReturnValue(res as NextApiResponse);
  return res as NextApiResponse;
}

describe("validate-character API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 for missing or invalid name", async () => {
    const req = {
      method: "POST",
      body: { name: "   " },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Valid character name required" });
  });

  it("falls back to safe response when Claude returns invalid JSON", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "{ not valid json" }] });
    const req = {
      method: "POST",
      body: { name: "SomeName" },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ characterName: "SomeName", isSafe: true, warningLevel: "none" }),
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "character_validation_failed",
      "Failed to validate character",
      expect.any(Object),
    );
  });

  it("parses valid Claude JSON and returns validation result", async () => {
    const text = JSON.stringify({
      isPublicDomain: false,
      isSafe: false,
      warningLevel: "warning",
      reason: "Trademarked",
      suggestions: ["Alt1", "Alt2"],
    });
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text }] });
    const req = {
      method: "POST",
      body: { name: "MyHero" },
    } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        characterName: "MyHero",
        isPublicDomain: false,
        isSafe: false,
        warningLevel: "warning",
        suggestions: ["Alt1", "Alt2"],
      }),
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "character_validated",
      "Character validation completed",
      expect.any(Object),
    );
  });
});

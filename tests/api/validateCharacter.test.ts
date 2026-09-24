import { createMocks } from "node-mocks-http";

const mockCreate = jest.fn().mockResolvedValue({
  content: [
    {
      type: "text",
      text: JSON.stringify({
        isPublicDomain: true,
        isSafe: true,
        warningLevel: "none",
        reason: "Sherlock Holmes is a public domain character from classic literature.",
        suggestions: [],
      }),
    },
  ],
});

jest.mock("@anthropic-ai/sdk", () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
  __esModule: true,
}));

jest.mock("../../src/utils/claudeModelSelector", () => ({
  getClaudeModel: (type: "text" | "text-simple" | "image") => {
    if (type === "image") throw new Error("Unknown type");
    return "claude-haiku-4-5-20251001";
  },
}));

jest.mock("express-rate-limit", () => {
  return jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
});

const mockRecordEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("../../src/utils/analytics", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

const mockScrubCachedAvatar = jest.fn().mockResolvedValue(false);
const mockScrubUserBotsByName = jest.fn().mockResolvedValue(0);
jest.mock("../../src/utils/avatarGeneration", () => ({
  scrubCachedAvatar: (...args: unknown[]) => mockScrubCachedAvatar(...args),
  scrubUserBotsByName: (...args: unknown[]) => mockScrubUserBotsByName(...args),
}));

const mockGetBlocklistEntry = jest.fn().mockResolvedValue(null);
const mockAddToBlocklist = jest.fn().mockResolvedValue(undefined);
const mockRemoveFromBlocklist = jest.fn().mockResolvedValue(false);
jest.mock("../../src/utils/characterBlocklist", () => ({
  getBlocklistEntry: (...args: unknown[]) => mockGetBlocklistEntry(...args),
  addToBlocklist: (...args: unknown[]) => mockAddToBlocklist(...args),
  removeFromBlocklist: (...args: unknown[]) => mockRemoveFromBlocklist(...args),
}));

const mockLogWarning = jest.fn().mockResolvedValue(undefined);
jest.mock("../../src/utils/characterWarningLog", () => ({
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
}));

describe("validate-character API", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockLogWarning.mockResolvedValue(undefined);
    mockScrubCachedAvatar.mockResolvedValue(false);
    mockScrubUserBotsByName.mockResolvedValue(0);
    mockGetBlocklistEntry.mockResolvedValue(null);
    mockAddToBlocklist.mockResolvedValue(undefined);
    mockRemoveFromBlocklist.mockResolvedValue(false);
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isPublicDomain: true,
            isSafe: true,
            warningLevel: "none",
            reason: "Sherlock Holmes is a public domain character from classic literature.",
            suggestions: [],
          }),
        },
      ],
    });
  });

  it("returns 405 if method is not POST", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "GET" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 400 if name is missing", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: {} });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 if name is not a string", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: 123 } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 if name is empty", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "   " } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns validation result for public domain character", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      // Not on the curated allowlist (src/utils/characterAllowlist.ts) — this test
      // exercises the ordinary Claude classification path, not the allowlist
      // short-circuit (see the dedicated allowlist tests below).
      body: { name: "Ada Lovelace" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.characterName).toBe("Ada Lovelace");
    expect(data.isPublicDomain).toBe(true);
    expect(data.isSafe).toBe(true);
    expect(data.warningLevel).toBe("none");
    expect(mockRecordEvent).toHaveBeenCalledWith("character_validated", {
      warningLevel: "none",
      blocked: false,
      recognized: true,
      scrubbed: false,
    });
  });

  it("passes through recognized: false for a generic common-noun/archetype name with no specific identity", async () => {
    // Regression test for a live prod incident: "Hero" (a bare generic word/archetype,
    // not a specific identifiable character) was classified recognized: true, so it
    // skipped the description-required flow and produced a nonsensical personality.
    // The prompt guardrail lives in validate-character.ts's system prompt (Claude's
    // classification isn't exercised here, since Claude itself is mocked) — this test
    // instead pins that the route faithfully passes a `recognized: false` result
    // through to the client, which is what makes that guardrail actually take effect.
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isPublicDomain: true,
            isSafe: true,
            warningLevel: "none",
            recognized: false,
            reason: "Hero is a generic role/archetype, not a specific identifiable character.",
            suggestions: [],
          }),
        },
      ],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Hero" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.characterName).toBe("Hero");
    expect(data.recognized).toBe(false);
    expect(data.blocked).toBe(false);
    expect(data.warningLevel).toBe("none");
    expect(mockRecordEvent).toHaveBeenCalledWith("character_validated", {
      warningLevel: "none",
      blocked: false,
      recognized: false,
      scrubbed: false,
    });
  });

  it("short-circuits to warningLevel none for a name on the curated public-domain allowlist, without calling Claude", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Sherlock Holmes" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.characterName).toBe("Sherlock Holmes");
    expect(data.warningLevel).toBe("none");
    expect(data.blocked).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockScrubCachedAvatar).not.toHaveBeenCalled();
  });

  it("self-heals a stale blocklist entry when the name is on the allowlist", async () => {
    // Deliberately NOT queuing a mockGetBlocklistEntry.mockResolvedValueOnce here —
    // the allowlist check happens first and short-circuits before the blocklist is
    // ever consulted (asserted below), so a queued-but-never-consumed once-value
    // would otherwise leak into a later test's call.
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Thor" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().warningLevel).toBe("none");
    expect(mockRemoveFromBlocklist).toHaveBeenCalledWith("Thor");
    // Allowlist wins outright — the blocklist is never even consulted.
    expect(mockGetBlocklistEntry).not.toHaveBeenCalled();
  });

  it("returns warning for copyrighted character", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isPublicDomain: false,
            isSafe: false,
            warningLevel: "warning",
            reason: "Spider-Man is a trademarked character owned by Marvel/Disney.",
            suggestions: ["Hercules", "Beowulf", "Robin Hood"],
          }),
        },
      ],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Spider-Man" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.characterName).toBe("Spider-Man");
    expect(data.isPublicDomain).toBe(false);
    expect(data.isSafe).toBe(false);
    expect(data.warningLevel).toBe("warning");
    expect(data.suggestions).toContain("Hercules");
    expect(data.blocked).toBe(false);
    // Not previously cached (mockScrubCachedAvatar defaults to false) — ordinary
    // overridable warning flow, not scrubbed.
    expect(data.scrubbed).toBeUndefined();
    expect(mockScrubCachedAvatar).toHaveBeenCalledWith("Spider-Man");
  });

  it("scrubs an already-cached character and returns a generic, non-overridable result when it fails re-validation", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isPublicDomain: false,
            isSafe: false,
            warningLevel: "warning",
            reason: "Spider-Man is a trademarked character owned by Marvel/Disney.",
            suggestions: ["Hercules", "Beowulf", "Robin Hood"],
          }),
        },
      ],
    });
    mockScrubCachedAvatar.mockResolvedValueOnce(true);

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Spider-Man" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.scrubbed).toBe(true);
    expect(data.warningLevel).toBe("warning");
    // Generic message — no copyright-specific reasoning or "continue anyway" bait
    // (suggestions), unlike the ordinary overridable warning flow above.
    expect(data.reason).toBe("This character is no longer available. Please try a different name.");
    expect(data.suggestions).toEqual([]);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "character_validated",
      expect.objectContaining({ scrubbed: true }),
    );
  });

  it("adds a fresh warning-level name to the blocklist without hard-blocking this first attempt", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isPublicDomain: false,
            isSafe: false,
            warningLevel: "warning",
            reason: "Elsa is a trademarked Disney character.",
            suggestions: ["Snow White (folklore)", "Persephone", "Freya"],
          }),
        },
      ],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Elsa" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    // Not cached yet — ordinary overridable warning flow for this one attempt.
    expect(data.scrubbed).toBeUndefined();
    expect(data.warningLevel).toBe("warning");
    expect(mockAddToBlocklist).toHaveBeenCalledWith(
      "Elsa",
      "Elsa is a trademarked Disney character.",
      "claude",
      "copyright",
    );
    // Independent, append-only record of the event, regardless of any later block/allow action.
    expect(mockLogWarning).toHaveBeenCalledWith("Elsa", "Elsa is a trademarked Disney character.");
  });

  it("short-circuits to a hard block, without calling Claude, for a name already on the blocklist (copyright category)", async () => {
    mockGetBlocklistEntry.mockResolvedValueOnce({
      characterName: "elsa",
      displayName: "Elsa",
      reason: "Elsa is a trademarked Disney character.",
      source: "claude",
      category: "copyright",
      createdAt: new Date(),
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Elsa" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.scrubbed).toBe(true);
    expect(data.warningLevel).toBe("warning");
    expect(data.blocked).toBe(false);
    expect(data.reason).toBe("This character is no longer available. Please try a different name.");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockScrubCachedAvatar).toHaveBeenCalledWith("Elsa");
    expect(mockScrubUserBotsByName).toHaveBeenCalledWith("Elsa");
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "character_validated",
      expect.objectContaining({ scrubbed: true }),
    );
    // No fresh classification happened, so there's nothing new to log.
    expect(mockLogWarning).not.toHaveBeenCalled();
  });

  it("short-circuits to a hard, never-overridable block for a name already on the blocklist under the content category", async () => {
    mockGetBlocklistEntry.mockResolvedValueOnce({
      characterName: "bill cosby",
      displayName: "Bill Cosby",
      reason: "Living person with a serious real-world criminal conviction.",
      source: "admin",
      category: "content",
      createdAt: new Date(),
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Bill Cosby" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.blocked).toBe(true);
    expect(data.scrubbed).toBeUndefined();
    expect(data.warningLevel).toBe("none");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockScrubCachedAvatar).toHaveBeenCalledWith("Bill Cosby");
    expect(mockScrubUserBotsByName).toHaveBeenCalledWith("Bill Cosby");
  });

  it("does not call scrubCachedAvatar for a caution-level or safe name", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Ada Lovelace" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockScrubCachedAvatar).not.toHaveBeenCalled();
  });

  it("returns blocked: true for an abusive name, independent of warningLevel, and persists it to the blocklist", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            blocked: true,
            isPublicDomain: true,
            isSafe: false,
            warningLevel: "none",
            reason: "This name contains a slur.",
            suggestions: [],
          }),
        },
      ],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Some Abusive Name" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.blocked).toBe(true);
    expect(data.warningLevel).toBe("none");
    // A fresh blocked:true result is persisted the same way a copyright "warning" is,
    // so a repeat attempt gets the fast, deterministic block instead of relying on
    // this non-deterministic classification catching it again every time.
    expect(mockAddToBlocklist).toHaveBeenCalledWith(
      "Some Abusive Name",
      "This name contains a slur.",
      "claude",
      "content",
    );
    expect(mockScrubCachedAvatar).toHaveBeenCalledWith("Some Abusive Name");
    expect(mockScrubUserBotsByName).toHaveBeenCalledWith("Some Abusive Name");
  });

  it("returns blocked: true for a living person with a serious real-world legal risk (e.g. Bill Cosby), independent of warningLevel", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            blocked: true,
            isPublicDomain: true,
            isSafe: false,
            warningLevel: "none",
            reason:
              "Living person with extensive credible allegations and a criminal conviction for sexual assault.",
            suggestions: [],
          }),
        },
      ],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Bill Cosby" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.blocked).toBe(true);
    expect(mockAddToBlocklist).toHaveBeenCalledWith(
      "Bill Cosby",
      "Living person with extensive credible allegations and a criminal conviction for sexual assault.",
      "claude",
      "content",
    );
    expect(mockScrubCachedAvatar).toHaveBeenCalledWith("Bill Cosby");
    expect(mockScrubUserBotsByName).toHaveBeenCalledWith("Bill Cosby");
  });

  it("defaults blocked to false when Claude omits the field", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isPublicDomain: true,
            isSafe: true,
            warningLevel: "none",
          }),
        },
      ],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Ada Lovelace" } });
    await handler(req, res);
    expect(res._getJSONData().blocked).toBe(false);
  });

  it("defaults blocked to false on a Claude API error", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Claude is down"));
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Ada Lovelace" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().blocked).toBe(false);
  });

  it("returns caution for uncertain character", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isPublicDomain: true,
            isSafe: true,
            warningLevel: "caution",
            reason: "Status uncertain, proceed with caution.",
            suggestions: ["Zeus", "Athena", "Apollo"],
          }),
        },
      ],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "SomeUnknownCharacter" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.warningLevel).toBe("caution");
  });

  it("handles Claude API errors gracefully", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Claude API error"));

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Test Character" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.isSafe).toBe(true);
    expect(data.warningLevel).toBe("none");
    expect(data.reason).toContain("Unable to validate");
  });

  it("handles invalid JSON from Claude gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "invalid json string" }],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Test" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.isSafe).toBe(true);
  });

  it("returns validation result for safe character with empty suggestions", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            isPublicDomain: true,
            isSafe: true,
            warningLevel: "none",
            reason: "Safe character.",
          }),
        },
      ],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Homer" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.characterName).toBe("Homer");
    expect(data.suggestions).toEqual([]);
  });

  it("handles partial validation response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ isPublicDomain: false }),
        },
      ],
    });

    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Partial" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.isPublicDomain).toBe(false);
    expect(data.isSafe).toBe(true); // defaults to true
    expect(data.warningLevel).toBe("none"); // defaults to none
  });

  it("extracts IP from x-forwarded-for header", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Test" },
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it("extracts IP from x-real-ip header when x-forwarded-for is missing", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Test" },
      headers: { "x-real-ip": "1.2.3.4" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it("handles request with connection.remoteAddress fallback", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Test" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).connection = { remoteAddress: "1.2.3.4" };
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it("handles request with socket.remoteAddress fallback", async () => {
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { name: "Test" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).socket = { remoteAddress: "1.2.3.4" };
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it("falls back to empty JSON when Claude returns non-text content type (L96 cond-expr[1])", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "image" }],
    });
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Test" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    // Falls back to safe defaults when JSON.parse('{}') has no fields
    expect(res._getJSONData().warningLevel).toBe("none");
  });

  it("uses default true when isPublicDomain is absent from Claude response (L101 binary-expr[1])", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ isSafe: true, warningLevel: "none" }),
        },
      ],
    });
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Test" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    // isPublicDomain is undefined → ?? true → defaults to true
    expect(res._getJSONData().isPublicDomain).toBe(true);
  });

  it("covers non-Error thrown in catch (L118 cond-expr[1])", async () => {
    mockCreate.mockRejectedValueOnce("plain rejection string");
    const handler = (await import("../../src/pages/api/validate-character")).default;
    const { req, res } = createMocks({ method: "POST", body: { name: "Test" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().isSafe).toBe(true);
  });
});

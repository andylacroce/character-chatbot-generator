import handler from "../../pages/api/transcript";
import { createMocks } from "node-mocks-http";

beforeEach(() => {
  process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "test-secret";
  jest.resetModules();
  jest.mock("../../src/utils/logger", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }));
});

describe("/api/transcript", () => {
  it(
    "should handle transcript",
    async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          messages: [
            { sender: "User", text: "Hello" },
            { sender: "Character", text: "You shall not pass!" },
          ],
          exportedAt: "2025-05-17 12:00:00 PDT",
        },
        headers: { "x-internal-api-secret": process.env.INTERNAL_API_SECRET },
      });
      await handler(req as unknown as import("next").NextApiRequest, res as unknown as import("next").NextApiResponse);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getData()).toContain("Character Chatbot Generator Transcript");
      expect(res._getData()).toContain("Me: Hello");
      expect(res._getData()).toContain("Character: You shall not pass!");
    },
    10000 // 10 seconds timeout
  );

  it("should return 405 for non-POST methods", async () => {
    const { req, res } = createMocks({
      method: "GET",
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
    expect(res._getData()).toContain("Method GET Not Allowed");
    expect(res.getHeader("Allow")).toContain("POST");
  });

  it("should return 400 if messages is missing", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: {},
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getData()).toContain("Messages array required");
  });

  it("should return 400 if messages is not an array", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: { messages: "not-an-array" },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getData()).toContain("Messages array required");
  });

  it("should handle empty messages array", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: { messages: [], exportedAt: undefined },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toContain("Messages: 0");
  });

  it("should encode filename and set headers", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: { messages: [{ sender: "User", text: "Hi" }], exportedAt: undefined },
    });
    await handler(req as any, res as any);
    expect(res.getHeader("Content-Type")).toContain("text/plain");
    const contentDisposition = res.getHeader("Content-Disposition") as string;
    expect(contentDisposition).toContain("attachment;");
    expect(contentDisposition).toContain("filename=");
    expect(contentDisposition).toContain("filename*=UTF-8''");
  });

  it("should handle messages with special characters and non-User sender", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: {
        messages: [
          { sender: "User", text: "Hello <world> & everyone!" },
          { sender: "Character", text: "It's dangerous to go alone! & <magic>" },
          { sender: "Frodo", text: "'Ring' > \"Sword\" & <Shire>" },
        ],
        exportedAt: undefined,
      },
    });
    await handler(req as any, res as any);
    const data = res._getData();
    expect(data).toContain("Me: Hello <world> & everyone!");
    expect(data).toContain("Character: It's dangerous to go alone! & <magic>");
    expect(data).toContain("Frodo: 'Ring' > \"Sword\" & <Shire>");
    expect(res._getStatusCode()).toBe(200);
  });

  // Test escapeHtml indirectly by checking transcript output for HTML special chars
  it("should not escape HTML in transcript output (escapeHtml is unused)", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: {
        messages: [
          { sender: "User", text: "<b>bold</b> & <i>italic</i>" },
        ],
        exportedAt: undefined,
      },
    });
    await handler(req as any, res as any);
    const data = res._getData();
    // The output should contain the raw HTML, since escapeHtml is not used
    expect(data).toContain("<b>bold</b> & <i>italic</i>");
  });

  it("should handle exportedAt undefined and set datetime", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: { messages: [{ sender: "User", text: "Hi" }], exportedAt: undefined },
    });
    await handler(req as any, res as any);
    const data = res._getData();
    expect(data).toMatch(/Exported: \d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
  });

  it("should handle message with missing sender and text", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: { messages: [{}], exportedAt: undefined },
    });
    await handler(req as any, res as any);
    const data = res._getData();
    expect(data).toContain("undefined: undefined");
    expect(res._getStatusCode()).toBe(200);
  });
});
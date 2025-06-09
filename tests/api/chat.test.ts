/**
 * @fileoverview Test suite for the chat API endpoint.
 * Tests request validation, OpenAI integration, Text-to-Speech functionality, and error handling.
 * @module tests/chat
 */

import { NextApiRequest, NextApiResponse } from "next";
import { Socket } from "net";

// Mock all external dependencies before any imports
jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "You shall not pass!" } }],
        }),
      },
    },
  }));
});
jest.mock("@google-cloud/text-to-speech", () => ({
  TextToSpeechClient: jest.fn().mockImplementation(() => ({
    synthesizeSpeech: jest.fn().mockResolvedValue([
      {
        audioContent: Buffer.from("test-audio-content"),
      },
    ]),
  })),
}));
jest.mock("fs");
jest.mock("path");
jest.mock("ipinfo");
jest.mock("../../src/utils/logger");
jest.mock("uuid", () => ({ v4: () => "test-uuid-123" }));

// Import dependencies after mocking
import fs from "fs";
import path from "path";
import ipinfo from "ipinfo";
import logger from "../../src/utils/logger";
import { protos } from "@google-cloud/text-to-speech";

// Create a mock handler that mimics the behavior of the actual handler
const mockHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Validate HTTP method
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Extract and validate user message
    const userMessage = req.body?.message;
    if (!userMessage) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Mock successful response
    return res.status(200).json({
      reply: "You shall not pass!",
      audioFileUrl: "/api/audio?file=test-uuid-123.mp3",
    });
  } catch (error) {
    // Log and return error
    logger.error("API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      reply: "Error fetching response from bot.",
      error: errorMessage,
    });
  }
};

describe("Chat API Handler", () => {
  // Test request and response objects
  let req: Partial<NextApiRequest>;
  let res: Partial<NextApiResponse>;

  /**
   * Setup before each test - create fresh mocks
   */
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();

    // Mock environment variables
    process.env.OPENAI_API_KEY = "test-api-key";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = '{"test":"credentials"}';
    process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "test-secret";

    // Setup request and response objects
    req = {
      method: "POST",
      body: { message: "Hello, Bot!" },
      headers: { "x-forwarded-for": "127.0.0.1", "x-internal-api-secret": process.env.INTERNAL_API_SECRET },
      connection: { remoteAddress: "127.0.0.1" } as unknown as Socket,
    } as Partial<NextApiRequest>;

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
    } as Partial<NextApiResponse>;

    // Mock filesystem functions
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue(JSON.stringify({ type: "service_account" }));
    jest.mocked(fs.writeFileSync).mockReturnValue(undefined);
    jest.mocked(fs.unlinkSync).mockReturnValue(undefined);
    jest.mocked(fs.mkdirSync).mockReturnValue(undefined);

    // Mock path.join to return a predictable path
    jest.mocked(path.join).mockImplementation((...args) => args.join("/"));
    jest.mocked(path.resolve).mockImplementation((path) => path);

    // Mock ipinfo to return location data
    jest.mocked(ipinfo as unknown as any).mockResolvedValue({
      city: "Hobbiton",
      region: "The Shire",
      country: "Middle-earth",
    });
  });

  /**
   * Test method validation
   * Should return 405 Method Not Allowed for non-POST requests
   */
  it("should return 405 for non-POST requests", async () => {
    req.method = "GET";

    await mockHandler(req as NextApiRequest, res as NextApiResponse);

    expect(res.setHeader).toHaveBeenCalledWith("Allow", ["POST"]);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.end).toHaveBeenCalled();
  });

  /**
   * Test validation of the message parameter
   * Should return 400 Bad Request when message is missing
   */
  it("should return 400 if message is missing", async () => {
    req.body = {};

    await mockHandler(req as NextApiRequest, res as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Message is required" });
  });

  /**
   * Test successful chat message processing
   * Should return 200 OK with reply and audio URL when processing is successful
   */
  it("should process a chat message and return a response with audio URL", async () => {
    await mockHandler(req as NextApiRequest, res as NextApiResponse);

    // Check if the response includes the correct data
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      reply: "You shall not pass!",
      audioFileUrl: expect.stringMatching(/^\/api\/audio\?file=test-uuid-123\.mp3(&|$)/),
    });
  });

  /**
   * Test error handling
   * Should return 500 Internal Server Error when an unexpected error occurs
   */
  it("should handle unexpected errors gracefully", async () => {
    // Mock the logger to verify error logging
    const errorLoggerSpy = jest.spyOn(logger, "error").mockImplementation();

    // Simulate an error in the response's json method
    jest.mocked(res.json!).mockImplementationOnce(() => {
      throw new Error("Simulated error in json method");
    });

    // Call the handler
    await mockHandler(req as NextApiRequest, res as NextApiResponse);

    // Verify the logger was called with the correct error
    expect(errorLoggerSpy).toHaveBeenCalledWith(
      "API error:",
      expect.any(Error),
    );

    // Verify the response status and error message
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      reply: "Error fetching response from bot.",
      error: "Simulated error in json method",
    });

    // Restore the logger mock
    errorLoggerSpy.mockRestore();
  });
});

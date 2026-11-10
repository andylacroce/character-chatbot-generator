/** @jest-environment node */

jest.mock("../../../src/utils/server/withRoute", () => ({
  withRoute: (_limit: unknown, handler: unknown) => handler,
}));

const mockModelsList = jest.fn();
jest.mock("../../../src/utils/claude/anthropicClient", () => ({
  __esModule: true,
  default: { models: { list: (...args: unknown[]) => mockModelsList(...args) } },
}));

const mockListVoices = jest.fn();
const mockTtsClientCtor = jest.fn();
jest.mock("@google-cloud/text-to-speech", () => ({
  __esModule: true,
  default: {
    TextToSpeechClient: function TextToSpeechClientMock(opts: unknown) {
      mockTtsClientCtor(opts);
      return { listVoices: (...args: unknown[]) => mockListVoices(...args) };
    },
  },
}));

const mockGoogleAuth = jest.fn();
jest.mock("google-auth-library", () => ({
  GoogleAuth: function GoogleAuthMock(opts: unknown) {
    mockGoogleAuth(opts);
    return { kind: "auth" };
  },
}));

const mockReadFileSync = jest.fn();
jest.mock("fs", () => ({
  __esModule: true,
  default: { readFileSync: (...args: unknown[]) => mockReadFileSync(...args) },
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

const mockLogEvent = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  generateRequestId: () => "generated-id",
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));

import { GET } from "../../../src/app/api/health/route";
import { routeRequest } from "../../helpers/routeRequest";

const SERVICE_ACCOUNT = JSON.stringify({
  client_email: "test@test.iam.gserviceaccount.com",
  private_key: "fake-key",
});

function makeReq(headers: Record<string, string> = {}) {
  return routeRequest("GET", { headers });
}

function claudeHealthy() {
  mockModelsList.mockResolvedValueOnce({ data: [{ id: "claude-haiku-4-5-20251001" }] });
}

function ttsHealthy() {
  mockListVoices.mockResolvedValueOnce([{ voices: [{ name: "en-GB-Wavenet-D" }] }]);
}

describe("health API", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, GOOGLE_APPLICATION_CREDENTIALS_JSON: SERVICE_ACCOUNT };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns 200 when both Claude and TTS respond", async () => {
    claudeHealthy();
    ttsHealthy();
    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", requestId: "generated-id" });
  });

  it("checks Claude via models.list and TTS via listVoices, not a real completion/synthesis", async () => {
    claudeHealthy();
    ttsHealthy();
    await GET(makeReq());

    expect(mockModelsList).toHaveBeenCalledWith({ limit: 1 });
    expect(mockListVoices).toHaveBeenCalledWith({ languageCode: "en-GB" });
  });

  it("echoes a caller-supplied request id", async () => {
    claudeHealthy();
    ttsHealthy();
    const res = await GET(makeReq({ "x-request-id": "caller-id" }));

    expect(await res.json()).toEqual({ status: "ok", requestId: "caller-id" });
  });

  it("builds an explicit auth client from the service account credentials", async () => {
    claudeHealthy();
    ttsHealthy();
    await GET(makeReq());

    expect(mockGoogleAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: expect.objectContaining({ client_email: "test@test.iam.gserviceaccount.com" }),
      }),
    );
  });

  it("reads credentials from disk when the env var holds a path", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = "/secrets/sa.json";
    mockReadFileSync.mockReturnValueOnce(SERVICE_ACCOUNT);
    claudeHealthy();
    ttsHealthy();
    const res = await GET(makeReq());

    expect(mockReadFileSync).toHaveBeenCalledWith("/secrets/sa.json", "utf8");
    expect(res.status).toBe(200);
  });

  it("falls back to application default credentials when the key material is incomplete", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({ project_id: "p" });
    claudeHealthy();
    ttsHealthy();
    const res = await GET(makeReq());

    expect(mockGoogleAuth).not.toHaveBeenCalled();
    expect(mockTtsClientCtor).toHaveBeenCalledWith(undefined);
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "health_tts_adc_fallback",
      expect.any(String),
      expect.any(Object),
    );
    expect(res.status).toBe(200);
  });

  it("reports a Claude failure as 500 without leaking the raw error message to the client", async () => {
    mockModelsList.mockRejectedValueOnce(new Error("anthropic down"));
    ttsHealthy();
    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      status: "error",
      claude: { status: "error" },
      tts: { status: "ok" },
      requestId: "generated-id",
    });
    // The detail is still captured server-side, just never returned to the caller.
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "health_claude_failed",
      expect.any(String),
      expect.objectContaining({ error: "anthropic down" }),
    );
  });

  it("treats a non-array models.list response as unhealthy", async () => {
    mockModelsList.mockResolvedValueOnce({ data: undefined });
    ttsHealthy();
    const res = await GET(makeReq());

    expect(await res.json()).toEqual(
      expect.objectContaining({
        claude: { status: "error" },
      }),
    );
  });

  it("reports missing TTS credentials as unhealthy", async () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    claudeHealthy();
    const res = await GET(makeReq());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        tts: { status: "error" },
      }),
    );
  });

  it("treats an empty voices list as unhealthy", async () => {
    claudeHealthy();
    mockListVoices.mockResolvedValueOnce([{ voices: [] }]);
    const res = await GET(makeReq());

    expect(await res.json()).toEqual(
      expect.objectContaining({
        tts: { status: "error" },
      }),
    );
  });

  it("stringifies non-Error throws from both probes", async () => {
    mockModelsList.mockRejectedValueOnce("claude string throw");
    mockListVoices.mockRejectedValueOnce("tts string throw");
    const res = await GET(makeReq());

    expect(await res.json()).toEqual(
      expect.objectContaining({
        claude: { status: "error" },
        tts: { status: "error" },
      }),
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "health_claude_failed",
      expect.any(String),
      expect.objectContaining({ error: "claude string throw" }),
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "health_tts_failed",
      expect.any(String),
      expect.objectContaining({ error: "tts string throw" }),
    );
  });

  it("omits the verbose error logs in production", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    mockModelsList.mockRejectedValueOnce(new Error("anthropic down"));
    ttsHealthy();
    await GET(makeReq());
    Object.defineProperty(process.env, "NODE_ENV", { value: originalNodeEnv, configurable: true });

    const events = mockLogEvent.mock.calls.map((c) => c[1]);
    expect(events).not.toContain("health_claude_error");
    expect(events).toContain("health_claude_failed");
  });
});

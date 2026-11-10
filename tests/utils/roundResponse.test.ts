/** @jest-environment node */
const mockLogEvent = jest.fn();
jest.mock("../../src/utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));
jest.mock("../../src/utils/game/definitions", () => ({}));
jest.mock("../../src/utils/game/token", () => ({}));
jest.mock("../../src/utils/avatar/avatarGeneration", () => ({}));
jest.mock("../../src/utils/chat/characterVoices", () => ({}));
jest.mock("../../src/utils/chat/ttsReply", () => ({}));
jest.mock("../../src/utils/game/gameReply", () => ({}));
jest.mock("../../src/utils/moderation/pickRandomCharacterName", () => ({}));
jest.mock("../../src/config/serverConfig", () => ({}));

import { roundResponse } from "../../src/utils/game/round";

const failure = { event: "x_failed", message: "Failed to x", error: "Could not x" };

async function frames(res: Response) {
  return (await res.text())
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, "")));
}

describe("roundResponse", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers a JSON body in plain mode", async () => {
    const res = await roundResponse(false, failure, async () => ({ reply: "hi" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "hi" });
  });

  it("streams real progress stages then the result as the final frame", async () => {
    const res = await roundResponse(true, failure, async (onProgress) => {
      onProgress?.("personality");
      onProgress?.("avatar");
      return { reply: "hi" };
    });
    expect(await frames(res)).toEqual([
      { stage: "personality", done: false },
      { stage: "avatar", done: false },
      { reply: "hi", done: true },
    ]);
  });

  it("logs a failure and reports it as a 500 in plain mode", async () => {
    const res = await roundResponse(false, failure, async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not x" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "x_failed",
      "Failed to x",
      expect.objectContaining({ error: "boom" }),
    );
  });

  it("reports a failure as a final error frame (not a status) when streaming", async () => {
    const res = await roundResponse(true, failure, async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(200);
    expect(await frames(res)).toEqual([{ error: "Could not x", done: true }]);
  });

  it("puts a new guest cookie on the response in either mode", async () => {
    for (const stream of [false, true]) {
      const res = await roundResponse(stream, failure, async () => ({}), "guest=1");
      expect(res.headers.get("set-cookie")).toBe("guest=1");
    }
  });
});

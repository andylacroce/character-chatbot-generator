/** @jest-environment node */
import { sseResponse } from "../../src/utils/sse";

/** Reads every `data:` frame from an SSE response. */
async function frames(res: Response) {
  return (await res.text())
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, "")));
}

describe("sseResponse", () => {
  it("streams each sent frame as `data: <json>` with unbuffered SSE headers", async () => {
    const res = sseResponse(async (send) => {
      send({ stage: "a", done: false });
      send({ done: true });
    });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(await frames(res)).toEqual([{ stage: "a", done: false }, { done: true }]);
  });

  it("ends with an error frame, not a dead stream, when the producer throws", async () => {
    const res = sseResponse(async (send) => {
      send({ chunk: "hi", done: false });
      throw new Error("boom");
    });
    expect(await frames(res)).toEqual([
      { chunk: "hi", done: false },
      { error: "Streaming failed", done: true },
    ]);
  });
});

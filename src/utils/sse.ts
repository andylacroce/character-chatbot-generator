/**
 * Shared helper for this app's plain `data: <json>\n\n` SSE responses, used by chat's streaming
 * replies and the guessing game's start/continue round-progress streaming. Not a general SSE
 * library: it sets the headers (including `no-transform`, which stops a CDN/proxy from buffering
 * the stream) and frames each message.
 */

/** Sends one SSE frame to the client. */
export type SseSend = (data: unknown) => void;

/**
 * Returns a `text/event-stream` response whose body is whatever `run` sends, closed when `run`
 * settles. `run` should report its own failures as a final frame; if it throws anyway the client
 * gets a generic error frame rather than a stream that just stops.
 */
export function sseResponse(run: (send: SseSend) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SseSend = (data) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        await run(send);
      } catch {
        send({ error: "Streaming failed", done: true });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

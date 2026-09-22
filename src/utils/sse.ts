/**
 * Shared helpers for this app's plain `data: <json>\n\n` SSE frames — used by chat.ts's
 * streaming chat replies and the guessing game's start/continue round-progress
 * streaming. Not a general SSE library, just the two lines every one of those routes
 * used to hand-roll, including the `no-transform` header that stops a CDN/proxy from
 * buffering the stream.
 */

import type { NextApiResponse } from "next";

/** Sets the response headers for a `text/event-stream` response: uncached, unbuffered, kept alive. */
export function setSseHeaders(res: NextApiResponse): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
}

/** Writes one `data: <json>\n\n` SSE frame. */
export function writeSseFrame(res: NextApiResponse, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

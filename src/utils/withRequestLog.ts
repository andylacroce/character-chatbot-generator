import type { NextApiRequest, NextApiResponse, NextApiHandler } from "next";
import { logEvent, sanitizeLogMeta } from "./logger";

/**
 * Wraps a Next.js API route handler so every call to it logs one structured
 * `http_request_completed` event (method, path, status code, duration)
 * through the same `logEvent`/Winston pipeline every other log line in this
 * app already goes through — this is the app's only per-request access log;
 * nothing else records a route's status code or duration today. Query
 * strings are stripped from the logged path since they can carry
 * user-authored content (e.g. `?name=`), which this app's logging
 * conventions say never to log on a routine path.
 */
export function withRequestLog(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const start = Date.now();
    try {
      await handler(req, res);
    } finally {
      const durationMs = Date.now() - start;
      const path = (req.url || "").split("?")[0];
      const status = res.statusCode;
      logEvent(
        typeof status === "number" && status >= 500 ? "error" : "info",
        "http_request_completed",
        "API request completed",
        sanitizeLogMeta({ method: req.method, path, status, durationMs }),
      );
    }
  };
}

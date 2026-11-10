import { NextRequest } from "next/server";

type Route = Record<string, unknown>;
type RouteFn = (req: NextRequest, ctx: unknown) => Promise<Response>;
/* eslint-disable @typescript-eslint/no-explicit-any -- adapter over loosely-typed legacy mocks */

/**
 * Adapts an App Router route module to the `(req, res)` shape the older API tests were written
 * against: builds a `NextRequest` from `req` (`method`, `body`, `query`, `headers`; `query.game`
 * becomes the `[game]` route param), calls the matching method export, then replays the
 * `Response` onto `res` (a redirect as `redirect(status, location)`; else `status`, `setHeader`, then `json`/`send`, or one `write` per SSE frame
 * followed by `end`). An unexported method yields 405, as Next itself does.
 */
export function asHandler(route: Route) {
  return async (req: any, res: any) => {
    const method = String(req.method ?? "GET").toUpperCase();
    const fn = route[method] as RouteFn | undefined;
    if (typeof fn !== "function") {
      res.status(405);
      res.end?.();
      return;
    }
    const url = new URL("http://localhost/api/test");
    for (const [k, v] of Object.entries(req.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers ?? {})) {
      if (typeof v === "string") headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(", ");
    }
    if (req.cookies && !headers.cookie) {
      headers.cookie = Object.entries(req.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }
    const hasBody = req.body !== undefined && method !== "GET" && method !== "HEAD";
    const response = await fn(
      new NextRequest(url, {
        method,
        headers,
        ...(hasBody
          ? { body: typeof req.body === "string" ? req.body : JSON.stringify(req.body) }
          : {}),
      }),
      { params: Promise.resolve({ game: req.query?.game }) },
    );
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      res.redirect(response.status, location);
      return;
    }
    res.status(response.status);
    const type = response.headers.get("content-type") ?? "";
    response.headers.forEach((value, key) => {
      if (key !== "content-type" || !type.startsWith("application/json")) {
        res.setHeader?.(key === "content-type" ? "Content-Type" : key, value);
      }
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const text = bytes.toString("utf8");
    if (type.startsWith("application/json")) {
      res.json(JSON.parse(text));
    } else if (type.startsWith("text/event-stream")) {
      for (const frame of text.split("\n\n").filter(Boolean)) res.write(`${frame}\n\n`);
      res.end();
    } else {
      if (res.send) res.send(type.startsWith("audio/") ? bytes : text);
      else res.end?.(text);
    }
  };
}

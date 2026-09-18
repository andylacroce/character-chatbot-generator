import type { NextApiRequest, NextApiResponse } from "next";

const mockLogEvent = jest.fn();
jest.mock("../../src/utils/logger", () => ({
  __esModule: true,
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));

import { withRequestLog } from "../../src/utils/withRequestLog";

function makeReq(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return { method: "GET", url: "/api/example", ...overrides } as unknown as NextApiRequest;
}

function makeRes(statusCode = 200): NextApiResponse {
  return { statusCode } as unknown as NextApiResponse;
}

beforeEach(() => {
  mockLogEvent.mockClear();
});

describe("withRequestLog", () => {
  it("calls the wrapped handler with the original req/res", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const req = makeReq();
    const res = makeRes();
    await withRequestLog(handler)(req, res);
    expect(handler).toHaveBeenCalledWith(req, res);
  });

  it("logs an info-level http_request_completed event with method/path/status/duration on success", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const req = makeReq({ method: "POST", url: "/api/game/start" });
    const res = makeRes(200);
    await withRequestLog(handler)(req, res);

    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    const [level, event, , meta] = mockLogEvent.mock.calls[0];
    expect(level).toBe("info");
    expect(event).toBe("http_request_completed");
    expect(meta).toMatchObject({ method: "POST", path: "/api/game/start", status: 200 });
    expect(typeof meta.durationMs).toBe("number");
  });

  it("falls back to an empty path when req.url is missing", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await withRequestLog(handler)(makeReq({ url: undefined }), makeRes());

    const [, , , meta] = mockLogEvent.mock.calls[0];
    expect(meta.path).toBe("");
  });

  it("strips the query string from the logged path", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const req = makeReq({ url: "/api/chars?name=Sherlock+Holmes&limit=60" });
    await withRequestLog(handler)(req, makeRes());

    const [, , , meta] = mockLogEvent.mock.calls[0];
    expect(meta.path).toBe("/api/chars");
  });

  it("logs at error level when the response status is 5xx", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await withRequestLog(handler)(makeReq(), makeRes(500));

    const [level] = mockLogEvent.mock.calls[0];
    expect(level).toBe("error");
  });

  it("defaults to info level when statusCode isn't a number (e.g. an unset test mock)", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await withRequestLog(handler)(makeReq(), {} as unknown as NextApiResponse);

    const [level, , , meta] = mockLogEvent.mock.calls[0];
    expect(level).toBe("info");
    expect(meta.status).toBeUndefined();
  });

  it("still logs and rethrows when the handler throws", async () => {
    const boom = new Error("boom");
    const handler = jest.fn().mockRejectedValue(boom);

    await expect(withRequestLog(handler)(makeReq(), makeRes())).rejects.toThrow("boom");
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
  });
});

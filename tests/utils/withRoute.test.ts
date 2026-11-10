/** @jest-environment node */
jest.unmock("../../src/utils/server/withRoute");
import { routeRequest } from "../helpers/routeRequest";

const mockLogEvent = jest.fn();
jest.mock("../../src/utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  sanitizeLogMeta: (m: unknown) => m,
}));

const mockCreateStore = jest.fn();
jest.mock("../../src/utils/server/rateLimitStore", () => ({
  createRateLimitStore: (...args: unknown[]) => mockCreateStore(...args),
}));

import { getRequestIp, withRoute } from "../../src/utils/server/withRoute";

const ok = async () => Response.json({ ok: true });
let n = 0;
/** A route with a unique name so in-memory counters never leak between tests. */
const limited = (max: number, handler = ok) =>
  withRoute({ name: `t${n++}`, max, message: "slow down" }, handler);
const from = (ip: string) => routeRequest("GET", { headers: { "x-forwarded-for": ip } });

describe("withRoute", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateStore.mockReturnValue(undefined);
  });

  it("reads the first forwarded IP, then x-real-ip, then 'unknown'", () => {
    expect(getRequestIp(from("1.1.1.1, 2.2.2.2"))).toBe("1.1.1.1");
    expect(getRequestIp(routeRequest("GET", { headers: { "x-real-ip": "3.3.3.3" } }))).toBe(
      "3.3.3.3",
    );
    expect(getRequestIp(routeRequest())).toBe("unknown");
  });

  it("returns 429 with Retry-After once an IP exceeds the limit, per IP", async () => {
    const route = limited(2);
    expect((await route(from("9.9.9.9"), undefined)).status).toBe(200);
    expect((await route(from("9.9.9.9"), undefined)).status).toBe(200);
    const res = await route(from("9.9.9.9"), undefined);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "slow down" });
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await route(from("8.8.8.8"), undefined)).status).toBe(200);
    expect(mockLogEvent).toHaveBeenCalledWith(
      "warn",
      "rate_limit_exceeded",
      expect.any(String),
      expect.objectContaining({ ip: "9.9.9.9" }),
    );
  });

  it("logs one http_request_completed line with the status and path only", async () => {
    await limited(5)(routeRequest("GET"), undefined);
    expect(mockLogEvent).toHaveBeenCalledWith(
      "info",
      "http_request_completed",
      expect.any(String),
      expect.objectContaining({ method: "GET", path: "/api/test", status: 200 }),
    );
  });

  it("logs a 500 and rethrows when the handler throws", async () => {
    const route = limited(5, async () => {
      throw new Error("boom");
    });
    await expect(route(routeRequest(), undefined)).rejects.toThrow("boom");
    expect(mockLogEvent).toHaveBeenCalledWith(
      "error",
      "http_request_completed",
      expect.any(String),
      expect.objectContaining({ status: 500 }),
    );
  });

  describe("with a shared store", () => {
    const store = (increment: jest.Mock) => {
      mockCreateStore.mockReturnValue({ init: jest.fn(), increment });
    };

    it("limits on the store's count", async () => {
      store(jest.fn().mockResolvedValue({ totalHits: 3, resetTime: new Date(Date.now() + 5000) }));
      expect((await limited(2)(from("1.1.1.1"), undefined)).status).toBe(429);
      store(jest.fn().mockResolvedValue({ totalHits: 2, resetTime: new Date() }));
      expect((await limited(2)(from("1.1.1.1"), undefined)).status).toBe(200);
    });

    it("fails open when the store errors", async () => {
      store(jest.fn().mockRejectedValue(new Error("redis down")));
      expect((await limited(1)(from("1.1.1.1"), undefined)).status).toBe(200);
    });
  });
});

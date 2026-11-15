/** @jest-environment node */
import { claimOnce, releaseClaim } from "../../src/utils/server/claimOnce";

const mockPipeline = jest.fn();
jest.mock("../../src/utils/server/rateLimitStore", () => ({
  ...jest.requireActual("../../src/utils/server/rateLimitStore"),
  redisPipeline: (...args: unknown[]) => mockPipeline(...args),
}));
jest.mock("../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

const REDIS_ENV = ["KV_REST_API_URL", "KV_REST_API_TOKEN"] as const;

describe("claimOnce without Redis", () => {
  it("lets the first caller win and rejects later ones until released", async () => {
    expect(await claimOnce("k1", 60)).toBe(true);
    expect(await claimOnce("k1", 60)).toBe(false);
    await releaseClaim("k1");
    expect(await claimOnce("k1", 60)).toBe(true);
  });

  it("expires a claim after its ttl", async () => {
    const spy = jest.spyOn(Date, "now");
    spy.mockReturnValue(1_000);
    expect(await claimOnce("k2", 1)).toBe(true);
    spy.mockReturnValue(3_000);
    expect(await claimOnce("k2", 1)).toBe(true);
    spy.mockRestore();
  });
});

describe("claimOnce memory bound", () => {
  it("evicts the oldest claims once past the cap, never growing without limit", async () => {
    for (let i = 0; i < 1100; i++) await claimOnce(`bulk-${i}`, 3600);
    // The oldest were evicted, so they can be claimed again; the newest are still held.
    expect(await claimOnce("bulk-0", 3600)).toBe(true);
    expect(await claimOnce("bulk-1099", 3600)).toBe(false);
  });
});

describe("claimOnce with Redis", () => {
  beforeEach(() => {
    process.env.KV_REST_API_URL = "https://kv.test";
    process.env.KV_REST_API_TOKEN = "t";
    mockPipeline.mockReset();
  });
  afterEach(() => REDIS_ENV.forEach((k) => delete process.env[k]));

  it("claims with SET NX EX and reads OK as the first caller", async () => {
    mockPipeline.mockResolvedValueOnce(["OK"]);
    expect(await claimOnce("k3", 60)).toBe(true);
    expect(mockPipeline.mock.calls[0][1]).toEqual([["SET", "claim:k3", "1", "EX", 60, "NX"]]);
  });

  it("reads a null SET as already claimed", async () => {
    mockPipeline.mockResolvedValueOnce([null]);
    expect(await claimOnce("k4", 60)).toBe(false);
  });

  it("fails open when the store errors", async () => {
    mockPipeline.mockRejectedValueOnce(new Error("down"));
    expect(await claimOnce("k5", 60)).toBe(true);
  });

  it("releases with DEL", async () => {
    mockPipeline.mockResolvedValueOnce([1]);
    await releaseClaim("k6");
    expect(mockPipeline.mock.calls[0][1]).toEqual([["DEL", "claim:k6"]]);
  });
});

import { parseTimeRange, pct, recentDayBounds } from "../../src/utils/admin/statsHelpers";

describe("pct", () => {
  it("rounds to one decimal place", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(4, 4)).toBe(100);
  });

  it("is null when the denominator is zero or negative", () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(5, -2)).toBeNull();
  });
});

describe("recentDayBounds", () => {
  afterEach(() => jest.useRealTimers());

  it("returns today and the start of the trailing 7-day window", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-09T12:00:00Z"));
    expect(recentDayBounds()).toEqual({ today: "2026-11-09", sevenDaysAgo: "2026-11-03" });
  });
});

describe("parseTimeRange", () => {
  afterEach(() => jest.useRealTimers());

  it("defaults to all time when query is empty or unknown", () => {
    expect(parseTimeRange({})).toEqual({ preset: "all" });
    expect(parseTimeRange({ window: "unknown" })).toEqual({ preset: "all" });
  });

  it("parses preset 'today'", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-09T12:00:00Z"));
    const res = parseTimeRange({ window: "today" });
    expect(res.preset).toBe("today");
    expect(res.range?.from?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(res.range?.to?.toISOString()).toBe("2026-11-09T12:00:00.000Z");
  });

  it.each(["7d", "30d", "90d"])("parses preset '%s'", (preset) => {
    const fixedNow = new Date("2026-11-09T12:00:00Z");
    jest.useFakeTimers().setSystemTime(fixedNow);
    const res = parseTimeRange({ window: preset });
    expect(res.preset).toBe(preset);
    expect(res.range?.to).toEqual(fixedNow);
    expect(res.range?.from?.getTime()).toBeLessThan(fixedNow.getTime());
  });

  it("parses custom date boundaries (from and to)", () => {
    const res = parseTimeRange({ from: "2026-11-01", to: "2026-11-05" });
    expect(res.preset).toBe("custom");
    expect(res.range?.from?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(res.range?.to?.toISOString()).toBe("2026-11-05T23:59:59.999Z");
  });

  it("ignores unparseable dates and falls back to all", () => {
    const res = parseTimeRange({ from: "not-a-date", to: "invalid" });
    expect(res.preset).toBe("all");
    expect(res.range).toBeUndefined();
  });
});

import { pct, recentDayBounds } from "../../src/utils/admin/statsHelpers";

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

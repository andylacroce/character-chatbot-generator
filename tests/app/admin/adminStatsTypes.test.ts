import { describeWindow, formatPct, pct } from "@/src/app/admin/adminStatsTypes";

describe("formatPct", () => {
  it("renders a percentage", () => {
    expect(formatPct(62.5)).toBe("62.5%");
    expect(formatPct(0)).toBe("0%");
  });

  it("renders an em dash when there is no denominator", () => {
    expect(formatPct(null)).toBe("—");
  });
});

describe("pct", () => {
  it("rounds to one decimal place", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(5, 5)).toBe(100);
  });

  it("is null when the total is zero or negative", () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(3, -1)).toBeNull();
  });
});

describe("describeWindow", () => {
  it("describes presets and custom ranges in plain words", () => {
    expect(describeWindow({ from: null, to: null, preset: "all" })).toBe("all recorded activity");
    expect(describeWindow({ from: null, to: null, preset: "today" })).toBe("today (UTC)");
    expect(describeWindow({ from: null, to: null, preset: "7d" })).toBe("the last 7 days");
    expect(
      describeWindow({
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-09T23:59:59.999Z",
        preset: "custom",
      }),
    ).toBe("Mar 1 to Mar 9 (UTC)");
    expect(describeWindow({ from: "2026-03-01T00:00:00.000Z", to: null, preset: "custom" })).toBe(
      "since Mar 1 (UTC)",
    );
  });
});

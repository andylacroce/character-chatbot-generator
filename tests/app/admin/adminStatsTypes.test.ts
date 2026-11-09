import { formatPct, pct } from "@/src/app/admin/adminStatsTypes";

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

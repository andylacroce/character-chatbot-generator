import { formatRelativeTime } from "@/src/utils/formatRelativeTime";

function isoSecondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

describe("formatRelativeTime", () => {
  it('returns "just now" for under 5 seconds', () => {
    expect(formatRelativeTime(isoSecondsAgo(0))).toBe("just now");
    expect(formatRelativeTime(isoSecondsAgo(4))).toBe("just now");
  });

  it("counts seconds between 5 and 59 seconds", () => {
    expect(formatRelativeTime(isoSecondsAgo(5))).toBe("5s ago");
    expect(formatRelativeTime(isoSecondsAgo(42))).toBe("42s ago");
    expect(formatRelativeTime(isoSecondsAgo(59))).toBe("59s ago");
  });

  it('returns "a few minutes ago" for 1-4 minutes', () => {
    expect(formatRelativeTime(isoSecondsAgo(90))).toBe("a few minutes ago");
    expect(formatRelativeTime(isoSecondsAgo(4 * 60))).toBe("a few minutes ago");
  });

  it("counts minutes between 5 and 59 minutes", () => {
    expect(formatRelativeTime(isoSecondsAgo(10 * 60))).toBe("10 minutes ago");
  });

  it('returns "an hour ago" for a single hour', () => {
    expect(formatRelativeTime(isoSecondsAgo(60 * 60))).toBe("an hour ago");
  });

  it("counts hours for 2-23 hours", () => {
    expect(formatRelativeTime(isoSecondsAgo(5 * 60 * 60))).toBe("5 hours ago");
  });

  it('returns "yesterday" for about a day', () => {
    expect(formatRelativeTime(isoSecondsAgo(24 * 60 * 60))).toBe("yesterday");
  });

  it("counts days for 2-6 days", () => {
    expect(formatRelativeTime(isoSecondsAgo(3 * 24 * 60 * 60))).toBe("3 days ago");
  });

  it("falls back to a localized date past a week", () => {
    const iso = isoSecondsAgo(10 * 24 * 60 * 60);
    expect(formatRelativeTime(iso)).toBe(new Date(iso).toLocaleDateString());
  });
});

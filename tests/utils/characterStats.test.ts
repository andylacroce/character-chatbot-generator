import { aggregateCharacterStats } from "../../src/utils/admin/characterStats";
import { makeStatsDb } from "../helpers/fakeStatsDb";
import type { EnvFilter } from "../../src/utils/admin/statsHelpers";

const envFilter = {} as EnvFilter;
const today = new Date().toISOString().slice(0, 10);

// The eight selects, in the order aggregateCharacterStats issues them.
function results(overrides: Partial<Record<string, unknown[]>> = {}) {
  return [
    overrides.daily ?? [{ day: today, validated: 4, created: 2, avatarGenerated: 2 }],
    overrides.validation ?? [{ total: 10, blocked: 1, unrecognized: 3 }],
    overrides.byLevel ?? [{ warningLevel: "none", total: 8 }],
    overrides.creators ?? [{ total: 6, guest: 4, signedIn: 2 }],
    overrides.avatars ?? [
      { provider: "cache", total: 3 },
      { provider: "none", total: 1 },
    ],
    overrides.bots ?? [{ total: 2, summarized: 1 }],
    overrides.messages ?? [{ total: 10 }],
    overrides.catalog ?? [
      { category: "history", total: 5 },
      { category: "mythology", total: 3 },
    ],
  ];
}

describe("aggregateCharacterStats", () => {
  it("derives the funnel, creator split, and per-bot message average", async () => {
    const stats = await aggregateCharacterStats(makeStatsDb(results()), envFilter, "test-env");
    expect(stats.totals).toEqual({
      bots: 2,
      messages: 10,
      avgMessagesPerBot: 5,
    });
    expect(stats.funnel).toEqual({ validated: 10, blocked: 1, created: 6, creationRatePct: 60 });
    expect(stats.creators).toEqual({ guestCount: 4, signedInCount: 2, guestPct: 66.7 });
    expect(stats.validation).toMatchObject({ unrecognizedCount: 3, unrecognizedPct: 30 });
    expect(stats.activity).toMatchObject({ createdToday: 2, createdLast7Days: 2 });
    expect(stats.catalog).toEqual({
      totalCached: 8,
      byCategory: [
        { category: "history", total: 5, pct: 62.5 },
        { category: "mythology", total: 3, pct: 37.5 },
      ],
    });
  });

  it("shares avatar providers and the silhouette fallback rate", async () => {
    const stats = await aggregateCharacterStats(makeStatsDb(results()), envFilter, "test-env");
    expect(stats.avatars.byProvider).toEqual([
      { provider: "cache", total: 3, pct: 75 },
      { provider: "none", total: 1, pct: 25 },
    ]);
    expect(stats.avatars.fallbackRatePct).toBe(25);
  });

  it("avoids dividing by zero when nothing has happened", async () => {
    const stats = await aggregateCharacterStats(
      makeStatsDb(
        results({
          daily: [],
          validation: [],
          byLevel: [],
          creators: [],
          avatars: [],
          bots: [],
          messages: [],
          catalog: [],
        }),
      ),
      envFilter,
      "test-env",
    );
    expect(stats.totals.avgMessagesPerBot).toBe(0);
    expect(stats.funnel.creationRatePct).toBeNull();
    expect(stats.avatars.fallbackRatePct).toBeNull();
    expect(stats.creators.guestPct).toBeNull();
    expect(stats.catalog).toEqual({ totalCached: 0, byCategory: [] });
  });
});

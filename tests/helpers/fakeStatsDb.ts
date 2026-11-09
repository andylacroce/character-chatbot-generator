import type { StatsDb } from "../../src/utils/admin/statsHelpers";

/**
 * A minimal chainable stand-in for a Drizzle query builder: every chain method returns
 * itself, and awaiting it resolves to the canned rows.
 */
export function makeQuery(rows: unknown[]) {
  const query = {
    from: () => query,
    where: () => query,
    groupBy: () => query,
    orderBy: () => query,
    innerJoin: () => query,
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

/** A fake database whose Nth `select()` call resolves to the Nth entry of `results`. */
export function makeStatsDb(results: unknown[][]): StatsDb {
  let call = 0;
  return { select: jest.fn(() => makeQuery(results[call++] ?? [])) } as unknown as StatsDb;
}

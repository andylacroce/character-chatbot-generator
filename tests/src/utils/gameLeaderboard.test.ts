const mockSelect = jest.fn();
const mockDb = { select: (...args: unknown[]) => mockSelect(...args) };
jest.mock("../../../src/db/client", () => ({ getDb: () => mockDb }));
jest.mock("../../../src/utils/environment", () => ({ getCurrentEnvironment: () => "test" }));

import { getLeaderboard, isTopTenPlayer } from "../../../src/utils/gameLeaderboard";

/** Makes a thenable Drizzle-like query returning the supplied rows. */
function query(rows: unknown[]) {
  const q = {
    from: () => q,
    where: () => q,
    orderBy: () => q,
    groupBy: () => q,
    limit: async () => rows,
    then: (resolve: (value: unknown[]) => void) => Promise.resolve(rows).then(resolve),
  };
  return q;
}

describe("game leaderboard", () => {
  beforeEach(() => jest.resetAllMocks());

  it("ranks account and guest scores together, publishing only opted-in names", async () => {
    mockSelect
      .mockReturnValueOnce(query([{ id: "user-1", streak: 3, date: new Date("2026-09-01") }]))
      .mockReturnValueOnce(
        query([
          { id: "guest-1", streak: 5, date: new Date("2026-09-02") },
          { id: "guest-2", streak: 4, date: new Date("2026-09-03") },
        ]),
      )
      .mockReturnValueOnce(query([{ id: "user-1", name: "Ada" }]))
      .mockReturnValueOnce(query([{ id: "guest-1", name: "Guest Ace" }]));

    expect(await getLeaderboard()).toEqual([
      { rank: 1, name: "Guest Ace", streak: 5 },
      { rank: 3, name: "Ada", streak: 3 },
    ]);
  });

  it("lets a guest claim only when its private score is in the overall top ten", async () => {
    mockSelect
      .mockReturnValueOnce(query([{ id: "user-1", streak: 3, date: new Date("2026-09-01") }]))
      .mockReturnValueOnce(query([{ id: "guest-1", streak: 5, date: new Date("2026-09-02") }]));
    expect(await isTopTenPlayer({ guestId: "guest-1" })).toBe(true);
  });
});

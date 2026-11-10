/** @jest-environment node */
import { routeRequest } from "../../../helpers/routeRequest";

const mockWithRoute = jest.fn((_limit: unknown, handler: unknown) => handler);
jest.mock("../../../../src/utils/server/withRoute", () => ({
  withRoute: (limit: unknown, handler: unknown) => mockWithRoute(limit, handler),
}));

import { gameRoute } from "../../../../src/utils/game/route";

const params = (game: string) => ({ params: Promise.resolve({ game }) });

describe("gameRoute", () => {
  const inner = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    inner.mockResolvedValue(Response.json({ ok: true }));
  });

  it("answers 404 for a [game] segment that is not a game, before any rate limiting", async () => {
    const res = await gameRoute({ endpoint: "unknown-game-case", max: 1 }, inner)(
      routeRequest("POST"),
      params("not-a-game"),
    );
    expect(res.status).toBe(404);
    expect(mockWithRoute).not.toHaveBeenCalled();
    expect(inner).not.toHaveBeenCalled();
  });

  it("hands the resolved server game to the handler", async () => {
    await gameRoute({ endpoint: "resolve-case", max: 1 }, inner)(
      routeRequest("POST"),
      params("guess-who-next"),
    );
    expect(inner).toHaveBeenCalledWith(
      expect.objectContaining({ id: "guessWhoNext", tables: expect.anything() }),
      expect.anything(),
    );
  });

  it("gives each game its own limiter for an endpoint, created once and reused", async () => {
    const route = gameRoute({ endpoint: "limiter-case", max: 7, message: "slow down" }, inner);
    await route(routeRequest("POST"), params("guess-who"));
    await route(routeRequest("POST"), params("guess-who"));
    await route(routeRequest("POST"), params("guess-who-next"));

    expect(mockWithRoute).toHaveBeenCalledTimes(2);
    expect(mockWithRoute).toHaveBeenCalledWith(
      { name: "guess-who-limiter-case", max: 7, message: "slow down" },
      expect.any(Function),
    );
    expect(mockWithRoute).toHaveBeenCalledWith(
      { name: "guess-who-next-limiter-case", max: 7, message: "slow down" },
      expect.any(Function),
    );
  });
});

import { GUESS_WHO, GUESS_WHO_NEXT } from "character-chatbot-shared";
import { makeReq, makeRes } from "../../../helpers/gameRoute";

const mockCreateRateLimiter = jest.fn((options: unknown) => options);
const mockApplyRateLimit = jest.fn();
jest.mock("../../../../src/utils/rateLimit", () => ({
  createRateLimiter: (options: unknown) => mockCreateRateLimiter(options),
  applyRateLimit: (...args: unknown[]) => mockApplyRateLimit(...args),
}));

jest.mock("../../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
  generateRequestId: () => "test-id",
}));

import { gameRoute, rejectMethod } from "../../../../src/utils/game/route";

describe("gameRoute", () => {
  const inner = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyRateLimit.mockResolvedValue(true);
  });

  it("answers 404 for a [game] segment that is not a game, before any rate limiting", async () => {
    const res = makeRes();
    const req = makeReq(GUESS_WHO, {});
    req.query = { game: "not-a-game" };
    await gameRoute({ endpoint: "unknown-game-case", max: 1 }, inner)(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockApplyRateLimit).not.toHaveBeenCalled();
    expect(inner).not.toHaveBeenCalled();
  });

  it("hands the resolved server game to the handler", async () => {
    await gameRoute({ endpoint: "resolve-case", max: 1 }, inner)(
      makeReq(GUESS_WHO_NEXT),
      makeRes(),
    );
    expect(inner).toHaveBeenCalledWith(
      expect.objectContaining({ id: "guessWhoNext", tables: expect.anything() }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("gives each game its own limiter for an endpoint, created once and reused", async () => {
    const route = gameRoute({ endpoint: "limiter-case", max: 7, message: "slow down" }, inner);
    await route(makeReq(GUESS_WHO), makeRes());
    await route(makeReq(GUESS_WHO), makeRes());
    await route(makeReq(GUESS_WHO_NEXT), makeRes());

    expect(mockCreateRateLimiter).toHaveBeenCalledTimes(2);
    expect(mockCreateRateLimiter).toHaveBeenCalledWith({
      name: "guess-who-limiter-case",
      max: 7,
      message: "slow down",
    });
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(
      expect.objectContaining({ name: "guess-who-next-limiter-case" }),
    );
  });

  it("stops at the rate limiter when a request is over the limit", async () => {
    mockApplyRateLimit.mockResolvedValue(false);
    await gameRoute({ endpoint: "blocked-case", max: 1 }, inner)(makeReq(GUESS_WHO), makeRes());
    expect(inner).not.toHaveBeenCalled();
  });
});

describe("rejectMethod", () => {
  it("lets an allowed method through and answers 405 with an Allow header otherwise", () => {
    const allowed = makeRes();
    expect(rejectMethod(makeReq(GUESS_WHO, {}, "GET"), allowed, ["GET", "POST"])).toBe(false);
    expect(allowed.status).not.toHaveBeenCalled();

    const rejected = makeRes();
    expect(rejectMethod(makeReq(GUESS_WHO, {}, "PUT"), rejected, ["GET", "POST"])).toBe(true);
    expect(rejected.setHeader).toHaveBeenCalledWith("Allow", ["GET", "POST"]);
    expect(rejected.status).toHaveBeenCalledWith(405);
  });
});

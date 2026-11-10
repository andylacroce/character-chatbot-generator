/** @jest-environment node */
import { routeRequest } from "../../helpers/routeRequest";

const mockGetSessionUserId = jest.fn();
jest.mock("../../../src/utils/account/getSessionUserId", () => ({
  getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockCreateReport = jest.fn();
jest.mock("../../../src/utils/moderation/contentReports", () => ({
  createReport: (...args: unknown[]) => mockCreateReport(...args),
}));

jest.mock("../../../src/utils/server/withRoute", () => ({
  withRoute: (_limit: unknown, handler: unknown) => handler,
}));

async function call(body: unknown, method = "POST") {
  const route = await import("../../../src/app/api/report/route");
  return route.POST(routeRequest(method, { body }));
}

describe("report API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSessionUserId.mockResolvedValue(null);
    mockCreateReport.mockResolvedValue(true);
  });

  it.each([
    ["an unknown target", { targetType: "x", characterName: "Ada", reason: "other" }],
    ["a missing name", { targetType: "character", reason: "other" }],
    ["an unknown reason", { targetType: "character", characterName: "Ada", reason: "spam" }],
    [
      "a message report without text",
      { targetType: "message", characterName: "Ada", reason: "other" },
    ],
  ])("returns 400 for %s", async (_label, body) => {
    expect((await call(body)).status).toBe(400);
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it("stores a guest's character report, keeping the name's apostrophe", async () => {
    const res = await call({
      targetType: "character",
      characterName: "  Joan d'Arc ",
      reason: "offensive",
      details: "  bad  ",
      messageText: "ignored for character reports",
    });
    expect(res.status).toBe(200);
    expect(mockCreateReport).toHaveBeenCalledWith({
      targetType: "character",
      characterName: "Joan d'Arc",
      messageText: null,
      reason: "offensive",
      details: "bad",
      reporterUserId: null,
    });
  });

  it("stores a signed-in message report with the reporter and a capped reply", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    await call({
      targetType: "message",
      characterName: "Ada",
      reason: "inaccurate",
      messageText: "x".repeat(5000),
    });
    const stored = mockCreateReport.mock.calls[0][0];
    expect(stored.reporterUserId).toBe("user-1");
    expect(stored.messageText).toHaveLength(1000);
  });

  it("returns 503 when the report could not be stored", async () => {
    mockCreateReport.mockResolvedValue(false);
    const res = await call({ targetType: "character", characterName: "Ada", reason: "other" });
    expect(res.status).toBe(503);
  });
});

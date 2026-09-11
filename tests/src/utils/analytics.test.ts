const mockValues = jest.fn().mockResolvedValue(undefined);
const mockInsert = jest.fn(() => ({ values: mockValues }));
const mockDb = { insert: mockInsert };
jest.mock("../../../src/db/client", () => ({ getDb: () => mockDb }));

jest.mock("../../../src/utils/environment", () => ({
  getCurrentEnvironment: () => "test-env",
}));

const mockLoggerError = jest.fn();
jest.mock("../../../src/utils/logger", () => ({
  __esModule: true,
  default: { error: (...args: unknown[]) => mockLoggerError(...args) },
}));

import { recordEvent } from "../../../src/utils/analytics";

describe("recordEvent", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, DATABASE_URL: "postgres://user:pass@host/db" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("no-ops without DATABASE_URL configured", async () => {
    process.env = { ...OLD_ENV, DATABASE_URL: undefined };
    await recordEvent("bot_created", { guest: true });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts a row scoped to the current environment", async () => {
    await recordEvent("bot_created", { guest: true }, "user-1");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({
      name: "bot_created",
      environment: "test-env",
      userId: "user-1",
      metadata: { guest: true },
    });
  });

  it("defaults userId to null and metadata to null when omitted", async () => {
    await recordEvent("avatar_generated");
    expect(mockValues).toHaveBeenCalledWith({
      name: "avatar_generated",
      environment: "test-env",
      userId: null,
      metadata: null,
    });
  });

  it("swallows and logs a DB error without throwing", async () => {
    mockValues.mockRejectedValueOnce(new Error("db down"));
    await expect(recordEvent("bot_created")).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to record analytics event:",
      expect.objectContaining({ name: "bot_created" }),
    );
  });
});

const mockGetToken = jest.fn();

jest.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

import type { NextApiRequest } from "next";
import { getSessionUserId } from "../../src/utils/getSessionUserId";

describe("getSessionUserId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when there is no token (cookie or bearer)", async () => {
    mockGetToken.mockResolvedValueOnce(null);
    const result = await getSessionUserId({} as NextApiRequest);
    expect(result).toBeNull();
  });

  it("returns null when the token has no sub", async () => {
    mockGetToken.mockResolvedValueOnce({});
    const result = await getSessionUserId({} as NextApiRequest);
    expect(result).toBeNull();
  });

  it("returns the user id from the token's sub claim", async () => {
    mockGetToken.mockResolvedValueOnce({ sub: "user-123" });
    const result = await getSessionUserId({} as NextApiRequest);
    expect(result).toBe("user-123");
  });
});

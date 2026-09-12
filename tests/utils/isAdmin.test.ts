const mockGetServerSession = jest.fn();

jest.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("../../src/auth/authOptions", () => ({ authOptions: { __fakeAuthOptions: true } }));

import type { NextApiRequest, NextApiResponse } from "next";
import { isAdmin, isAdminSession } from "../../src/utils/isAdmin";

describe("isAdmin", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, ADMIN_EMAILS: "admin@example.com, other@example.com" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns false with no ADMIN_EMAILS configured, without even checking the session", async () => {
    process.env.ADMIN_EMAILS = "";
    const result = await isAdmin({} as NextApiRequest, {} as NextApiResponse);
    expect(result).toBe(false);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it("returns false when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const result = await isAdmin({} as NextApiRequest, {} as NextApiResponse);
    expect(result).toBe(false);
  });

  it("returns false when the session email isn't in ADMIN_EMAILS", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "stranger@example.com" } });
    const result = await isAdmin({} as NextApiRequest, {} as NextApiResponse);
    expect(result).toBe(false);
  });

  it("returns true (case-insensitively) for a session email in ADMIN_EMAILS", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "Admin@Example.com" } });
    const result = await isAdmin({} as NextApiRequest, {} as NextApiResponse);
    expect(result).toBe(true);
  });

  it("refuses admin status on a Vercel Preview deployment regardless of email match", async () => {
    process.env.VERCEL_ENV = "preview";
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "admin@example.com" } });
    const result = await isAdmin({} as NextApiRequest, {} as NextApiResponse);
    expect(result).toBe(false);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });
});

describe("isAdminSession", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...OLD_ENV, ADMIN_EMAILS: "admin@example.com, other@example.com" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("calls getServerSession with just authOptions (no req/res), for App Router usage", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "admin@example.com" } });
    const result = await isAdminSession();
    expect(result).toBe(true);
    expect(mockGetServerSession).toHaveBeenCalledWith({ __fakeAuthOptions: true });
  });

  it("returns false with no ADMIN_EMAILS configured, without even checking the session", async () => {
    process.env.ADMIN_EMAILS = "";
    const result = await isAdminSession();
    expect(result).toBe(false);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it("returns false when the session email isn't in ADMIN_EMAILS", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "stranger@example.com" } });
    const result = await isAdminSession();
    expect(result).toBe(false);
  });

  it("refuses admin status on a Vercel Preview deployment regardless of email match", async () => {
    process.env.VERCEL_ENV = "preview";
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "admin@example.com" } });
    const result = await isAdminSession();
    expect(result).toBe(false);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });
});

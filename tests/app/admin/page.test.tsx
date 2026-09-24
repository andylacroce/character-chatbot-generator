import React from "react";
import { render, screen } from "@testing-library/react";

const mockIsAdminSession = jest.fn();
jest.mock("@/src/utils/isAdmin", () => ({
  isAdminSession: () => mockIsAdminSession(),
}));

const mockNotFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
jest.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}));

jest.mock("@/src/app/admin/AdminStatsView", () => ({
  __esModule: true,
  default: () => <div data-testid="admin-stats-view-stub" />,
}));

import AdminPage from "@/src/app/admin/page";

describe("AdminPage (server-side admin gate)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls notFound() for a non-admin session, without rendering the stats view", async () => {
    mockIsAdminSession.mockResolvedValue(false);
    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("renders the admin stats view for a confirmed admin", async () => {
    mockIsAdminSession.mockResolvedValue(true);
    const ui = await AdminPage();
    expect(mockNotFound).not.toHaveBeenCalled();
    render(ui);
    expect(screen.getByTestId("admin-stats-view-stub")).toBeInTheDocument();
  });
});

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

jest.mock("@/app/admin/moderation/AdminModerationView", () => ({
  __esModule: true,
  default: () => <div data-testid="admin-moderation-view-stub" />,
}));

import AdminModerationPage from "@/app/admin/moderation/page";

describe("AdminModerationPage (server-side admin gate)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls notFound() for a non-admin session, without rendering the moderation view", async () => {
    mockIsAdminSession.mockResolvedValue(false);
    await expect(AdminModerationPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("renders the admin moderation view for a confirmed admin", async () => {
    mockIsAdminSession.mockResolvedValue(true);
    const ui = await AdminModerationPage();
    expect(mockNotFound).not.toHaveBeenCalled();
    render(ui);
    expect(screen.getByTestId("admin-moderation-view-stub")).toBeInTheDocument();
  });
});

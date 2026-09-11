import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import AdminStatsPage from "@/app/admin/page";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

describe("AdminStatsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a not-signed-in message for a guest, without fetching stats", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    render(<AdminStatsPage />);
    expect(screen.getByText("Not signed in.")).toBeInTheDocument();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it("shows a not-authorized message when the API returns 403", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: false, status: 403 });
    render(<AdminStatsPage />);
    await waitFor(() => expect(screen.getByText("Not authorized.")).toBeInTheDocument());
  });

  it("renders aggregate stats for an admin", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        eventCounts: [{ name: "bot_created", total: 5 }],
        dailyCounts: [],
        avatarProviders: [{ provider: "cloudflare", total: 5 }],
        validationOutcomes: [],
        botCreators: [],
        totals: { bots: 2, messages: 10 },
      }),
    });
    render(<AdminStatsPage />);
    await waitFor(() =>
      expect(screen.getByText(/Saved characters \(bots\): 2/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Persisted messages: 10/)).toBeInTheDocument();
    expect(screen.getByText(/bot_created: 5/)).toBeInTheDocument();
  });
});

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import AdminStatsPage from "@/app/admin/page";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

const FULL_STATS = {
  environment: "production",
  generatedAt: new Date().toISOString(),
  totals: { bots: 2, messages: 10, avgMessagesPerBot: 5 },
  activity: {
    createdToday: 1,
    createdLast7Days: 3,
    daily: [{ day: "2026-09-10", validated: 4, created: 2, avatarGenerated: 2 }],
  },
  funnel: { validated: 10, blocked: 1, created: 6, creationRatePct: 60 },
  validation: {
    byWarningLevel: [
      { warningLevel: "none", total: 8 },
      { warningLevel: "caution", total: 2 },
    ],
    unrecognizedCount: 3,
    unrecognizedPct: 30,
  },
  creators: { guestCount: 4, signedInCount: 2, guestPct: 66.7 },
  avatars: {
    byProvider: [
      { provider: "cache", total: 3, pct: 50 },
      { provider: "none", total: 1, pct: 16.7 },
    ],
    fallbackRatePct: 16.7,
  },
};

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

  it("shows a generic failure message on a non-403 error", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: false, status: 500 });
    render(<AdminStatsPage />);
    await waitFor(() => expect(screen.getByText("Failed to load stats.")).toBeInTheDocument());
  });

  it("renders derived aggregate stats for an admin", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: true, json: async () => FULL_STATS });
    render(<AdminStatsPage />);

    await waitFor(() => expect(screen.getByText("production")).toBeInTheDocument());
    expect(screen.getByText("Saved characters")).toBeInTheDocument();
    expect(screen.getByText("5 avg per bot")).toBeInTheDocument();
    // Funnel stages ("Names validated"/"Characters created" also appear in the
    // activity chart's legend and table view, so scope to the funnel section).
    expect(screen.getAllByText("Names validated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Characters created").length).toBeGreaterThan(0);
    expect(screen.getByText("60%")).toBeInTheDocument();
    // Copyright/trademark breakdown labels
    expect(screen.getByText("No concern")).toBeInTheDocument();
    expect(screen.getByText("Caution (possible trademark)")).toBeInTheDocument();
    // Creator split
    expect(screen.getByText(/Guests: 4/)).toBeInTheDocument();
    expect(screen.getByText(/Signed-in: 2/)).toBeInTheDocument();
    // Avatar provider breakdown + fallback callout
    expect(screen.getByText("Reused from cache")).toBeInTheDocument();
    expect(screen.getByText(/fell back to the plain silhouette/)).toBeInTheDocument();
  });

  it("omits the fallback callout when no requests fell back to the silhouette", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...FULL_STATS,
        avatars: { byProvider: [{ provider: "cache", total: 3, pct: 100 }], fallbackRatePct: 0 },
      }),
    });
    render(<AdminStatsPage />);
    await waitFor(() => expect(screen.getByText("Reused from cache")).toBeInTheDocument());
    expect(screen.queryByText(/fell back to the plain silhouette/)).not.toBeInTheDocument();
  });

  it("re-fetches when the manual refresh button is clicked", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: true, json: async () => FULL_STATS });
    render(<AdminStatsPage />);
    // Wait for the fetch to fully settle (isRefreshing back to false) so the button
    // is enabled before clicking it — waiting only on the call count races against
    // the in-flight request still disabling the button.
    const refreshButton = await screen.findByRole("button", { name: "Refresh stats" });
    await waitFor(() => expect(refreshButton).not.toBeDisabled());
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1);

    fireEvent.click(refreshButton);
    await waitFor(() => expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(2));
  });

  it("auto-refreshes on the selected interval, and stops when set to off", async () => {
    jest.useFakeTimers();
    try {
      mockUseSession.mockReturnValue({ status: "authenticated" });
      mockAuthenticatedFetch.mockResolvedValue({ ok: true, json: async () => FULL_STATS });
      render(<AdminStatsPage />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1);

      // Default interval is 1m.
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(2);

      fireEvent.change(screen.getByLabelText("Auto-refresh interval"), {
        target: { value: "0" },
      });
      // Switching to "off" itself triggers one immediate fetch (the effect re-runs on
      // refreshIntervalMs change), then no further scheduled ones.
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(3);

      await act(async () => {
        jest.advanceTimersByTime(5 * 60_000);
      });
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});

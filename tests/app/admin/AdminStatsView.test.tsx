import React from "react";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import AdminStatsView from "@/src/app/admin/AdminStatsView";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  getProviders: () => Promise.resolve({}),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

// useAccountMenu (identity/admin-check) and useUserName also call authenticatedFetch
// now that AdminStatsView uses the shared header, so call-count assertions need to
// count only the /api/admin/stats calls they actually care about, not every call.
function statsCallCount() {
  return mockAuthenticatedFetch.mock.calls.filter((c) => c[0] === "/api/admin/stats").length;
}

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
  game: {
    starts: 8,
    startedToday: 1,
    startedLast7Days: 3,
    guestStarts: 5,
    guestPct: 62.5,
    correctGuesses: 6,
    wrongGuesses: 4,
    guessAccuracyPct: 60,
    continuedRounds: 4,
    continuationPct: 66.7,
    endedByWrongGuess: 2,
    endedByGiveUp: 1,
    avgFinalStreak: 1.7,
    bestStreak: 4,
    finalStreaks: { zero: 1, one: 1, twoToFour: 1, fiveOrMore: 0 },
    daily: [{ day: new Date().toISOString().slice(0, 10), started: 1, correct: 2, ended: 1 }],
  },
};

describe("AdminStatsView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a not-signed-in message for a guest, without fetching stats", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    render(<AdminStatsView />);
    expect(screen.getByText("Not signed in.")).toBeInTheDocument();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it("shows a not-authorized message when the API returns 403", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: false, status: 403 });
    render(<AdminStatsView />);
    await waitFor(() => expect(screen.getByText("Not authorized.")).toBeInTheDocument());
  });

  it("shows a generic failure message on a non-403 error", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: false, status: 500 });
    render(<AdminStatsView />);
    await waitFor(() => expect(screen.getByText("Failed to load stats.")).toBeInTheDocument());
  });

  it("renders derived aggregate stats for an admin", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: true, json: async () => FULL_STATS });
    render(<AdminStatsView />);

    await waitFor(() => expect(screen.getByText("production")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Guessing game" })).toBeInTheDocument();
    expect(screen.getByText("Guess accuracy")).toBeInTheDocument();
    expect(screen.getByText("62.5%", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("2–4 wins")).toBeInTheDocument();
    expect(screen.queryByText("Saved characters")).not.toBeInTheDocument();
    expect(screen.queryByText("Hover or focus a point for exact counts")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Chart and table date range" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Character creation" }));
    expect(screen.getByText("Saved characters")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Chart and table date range" })).toBeInTheDocument();
    expect(screen.getByText("5 avg per bot")).toBeInTheDocument();
    // Funnel stages ("Names validated"/"Characters created" also appear in the
    // activity chart's legend and table view, so scope to the funnel section).
    expect(screen.getAllByText("Names validated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Characters created").length).toBeGreaterThan(0);
    expect(screen.getAllByText("60%").length).toBeGreaterThan(0);
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

  it("labels the game date range as applying only to the chart and its table", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: true, json: async () => FULL_STATS });
    render(<AdminStatsView />);
    const range = await screen.findByRole("group", { name: "Chart and table date range" });
    fireEvent.click(within(range).getByRole("button", { name: "7d" }));
    expect(
      screen.getByRole("img", { name: "Game activity over the last 7 days" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How runs progress" })).toBeInTheDocument();
  });

  it("switches stats sections with the keyboard", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: true, json: async () => FULL_STATS });
    render(<AdminStatsView />);
    const gameTab = await screen.findByRole("tab", { name: "Guessing game" });
    await screen.findByText("Guess accuracy");
    gameTab.focus();
    fireEvent.keyDown(gameTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Character creation" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Saved characters")).toBeInTheDocument();
    expect(screen.queryByText("Guess accuracy")).not.toBeInTheDocument();
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
    render(<AdminStatsView />);
    await screen.findByRole("tab", { name: "Character creation" });
    fireEvent.click(screen.getByRole("tab", { name: "Character creation" }));
    await waitFor(() => expect(screen.getByText("Reused from cache")).toBeInTheDocument());
    expect(screen.queryByText(/fell back to the plain silhouette/)).not.toBeInTheDocument();
  });

  it("re-fetches when the manual refresh button is clicked", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ ok: true, json: async () => FULL_STATS });
    render(<AdminStatsView />);
    // Wait for the fetch to fully settle (isRefreshing back to false) so the button
    // is enabled before clicking it — waiting only on the call count races against
    // the in-flight request still disabling the button.
    const refreshButton = await screen.findByRole("button", { name: "Refresh stats" });
    await waitFor(() => expect(refreshButton).not.toBeDisabled());
    expect(statsCallCount()).toBe(1);

    fireEvent.click(refreshButton);
    await waitFor(() => expect(statsCallCount()).toBe(2));
  });

  it("auto-refreshes on the selected interval, and stops when set to off", async () => {
    jest.useFakeTimers();
    try {
      mockUseSession.mockReturnValue({ status: "authenticated" });
      mockAuthenticatedFetch.mockResolvedValue({ ok: true, json: async () => FULL_STATS });
      render(<AdminStatsView />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(statsCallCount()).toBe(1);

      // Default interval is 1m.
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(statsCallCount()).toBe(2);

      fireEvent.change(screen.getByLabelText("Auto-refresh interval"), {
        target: { value: "0" },
      });
      // Switching to "off" itself triggers one immediate fetch (the effect re-runs on
      // refreshIntervalMs change), then no further scheduled ones.
      await act(async () => {
        await Promise.resolve();
      });
      expect(statsCallCount()).toBe(3);

      await act(async () => {
        jest.advanceTimersByTime(5 * 60_000);
      });
      expect(statsCallCount()).toBe(3);
    } finally {
      jest.useRealTimers();
    }
  });
});

import { renderHook, waitFor, act } from "@testing-library/react";
import { useAdminStats } from "@/src/app/admin/useAdminStats";
import { FULL_STATS } from "../../helpers/adminStatsFixture";

const mockFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockFetch(...args),
}));

const ok = { ok: true, status: 200, json: async () => FULL_STATS };

describe("useAdminStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(ok);
  });

  afterEach(() => jest.useRealTimers());

  it("does not fetch until authenticated", () => {
    renderHook(() => useAdminStats(false));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("loads stats once authenticated", async () => {
    const { result } = renderHook(() => useAdminStats(true));
    await waitFor(() => expect(result.current.stats).toEqual(FULL_STATS));
    expect(mockFetch).toHaveBeenCalledWith("/api/admin/stats");
    expect(result.current.error).toBeNull();
    expect(result.current.isRefreshing).toBe(false);
  });

  it.each([
    [403, "Not authorized."],
    [500, "Failed to load stats."],
  ])("reports a %s response", async (status, message) => {
    mockFetch.mockResolvedValue({ ok: false, status });
    const { result } = renderHook(() => useAdminStats(true));
    await waitFor(() => expect(result.current.error).toBe(message));
    expect(result.current.stats).toBeNull();
  });

  it("reports a network failure", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAdminStats(true));
    await waitFor(() => expect(result.current.error).toBe("Failed to load stats."));
  });

  it("refreshes on demand", async () => {
    const { result } = renderHook(() => useAdminStats(true));
    await waitFor(() => expect(result.current.stats).not.toBeNull());
    await act(async () => {
      await result.current.fetchStats();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("auto-refreshes on the chosen interval and stops when turned off", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAdminStats(true));
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    act(() => result.current.setRefreshIntervalMs(0));
    await act(async () => {});
    const callsAfterOff = mockFetch.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(10 * 60_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(callsAfterOff);
  });
});

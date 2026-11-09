import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../utils/api";
import type { AdminStats } from "./adminStatsTypes";

// The admin-stats rate limiter allows 20 req/min/IP (see pages/api/admin/stats.ts) — even
// the fastest option here (every 15s) stays well under that.
export const REFRESH_INTERVAL_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "15s", value: 15_000 },
  { label: "30s", value: 30_000 },
  { label: "1m", value: 60_000 },
  { label: "5m", value: 300_000 },
];
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

/**
 * Loads `GET /api/admin/stats` once the session is authenticated and then on the chosen
 * auto-refresh interval. `fetchStats` refreshes on demand.
 */
export function useAdminStats(authenticated: boolean) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(DEFAULT_REFRESH_INTERVAL_MS);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchStats = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await authenticatedFetch("/api/admin/stats");
      if (!isMountedRef.current) return;
      if (!res.ok) {
        setError(res.status === 403 ? "Not authorized." : "Failed to load stats.");
        return;
      }
      setStats(await res.json());
      setError(null);
    } catch {
      if (isMountedRef.current) setError("Failed to load stats.");
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  }, []);

  // Fetches immediately on auth/interval-setting change, then (when enabled) on a
  // recurring timer — same "fetch on mount, from an effect" shape as index.tsx's
  // localStorage restore, which carries the same suppression for the same reason:
  // fetchStats's own setState calls are what the effect exists to trigger.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!authenticated) return;
    fetchStats();
    if (refreshIntervalMs <= 0) return;
    const interval = setInterval(fetchStats, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [authenticated, fetchStats, refreshIntervalMs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { stats, error, isRefreshing, refreshIntervalMs, setRefreshIntervalMs, fetchStats };
}

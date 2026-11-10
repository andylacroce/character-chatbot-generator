"use client";

/**
 * Internal, admin-only view of aggregate usage stats from `analytics_events` (and
 * bots/messages counts). Rendered only for a confirmed admin — app/admin/page.tsx (a
 * Server Component) 404s everyone else before this ever mounts, so nothing here is
 * reachable client-side by a non-admin visitor in the first place.
 *
 * The `useSession` check below is a defensive fallback for state changing *after*
 * mount (e.g. the admin signs out in another tab) — GET /api/admin/stats (see
 * src/utils/account/isAdmin.ts) remains the actual data-access boundary either way, so nothing
 * sensitive is ever fetched or rendered without both checks agreeing.
 *
 * Uses the same shared AppHeader/useAccountMenu every other page uses (identity,
 * change name, sign in/out, and — since useAccountMenu already knows this caller is an
 * admin — the Stats/Moderation admin links too), rather than a bespoke standalone
 * masthead, so an admin page's chrome doesn't drift from the rest of the app. "Back to
 * Home" lives in the hamburger menu here (not the header's center slot, unlike a page
 * with real focal content there) since this page has nothing else to put there.
 *
 * Every number here is a *derived* metric (a rate, a share, a funnel stage) rather
 * than a raw `analytics_events` dump — see pages/api/admin/stats.ts, which computes
 * these server-side specifically because the raw rows (boolean strings in jsonb
 * metadata, several unrelated event types in one table) are ambiguous without reading
 * the recording call sites.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FaSyncAlt, FaHome } from "react-icons/fa";
import { formatRelativeTime } from "character-chatbot-shared";
import { GameStatsPanel } from "./GameStatsPanel";
import { CharacterStatsPanel } from "./CharacterStatsPanel";
import { REFRESH_INTERVAL_OPTIONS, useAdminStats } from "./useAdminStats";
import { TIME_WINDOW_PRESETS } from "./adminStatsTypes";
import AppHeader from "../components/common/AppHeader";
import { BackLink } from "../components/common/BackLink";
import AdminNav from "./AdminNav";
import { useAccountMenu } from "../components/account/useAccountMenu";
import styles from "../components/styles/AdminStats.module.css";

/** Admin stats view — see module doc above for the access-control story. */
export default function AdminStatsView() {
  const { status } = useSession();
  const { menuItems, modals } = useAccountMenu();
  const {
    stats,
    error,
    isRefreshing,
    refreshIntervalMs,
    setRefreshIntervalMs,
    fetchStats,
    timeWindow,
    setTimeWindow,
  } = useAdminStats(status === "authenticated");
  const [activeView, setActiveView] = useState<"game" | "characters">("game");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // A pure re-render tick — formatRelativeTime(stats.generatedAt) re-derives its string
  // from Date.now() on every render, but without something forcing a render between
  // fetches, "Updated 3s ago" would stay frozen at whatever it said when the data last
  // arrived (up to a full refresh interval later) instead of counting up live.
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fullMenuItems = (
    <>
      <Link href="/">
        <FaHome size={18} className="menuIcon" />
        <span>Back to Home</span>
      </Link>
      <div className="menuDivider" role="separator" />
      {menuItems}
    </>
  );

  return (
    <>
      <AppHeader
        menuItems={fullMenuItems}
        left={<BackLink />}
        center={<h1 className={styles.title}>Internal stats</h1>}
      />
      {modals}
      <div className={styles.page}>
        <AdminNav />
        <div className={styles.header}>
          {status === "authenticated" && (
            <div className={styles.meta}>
              {stats && (
                <div className={styles.metaInfo}>
                  <span
                    className={`${styles.envBadge} ${
                      stats.environment === "production" ? styles.envBadgeProduction : ""
                    }`}
                  >
                    {stats.environment}
                  </span>
                  <span className={styles.updatedTime}>
                    {isRefreshing
                      ? "Refreshing…"
                      : `Updated ${formatRelativeTime(stats.generatedAt)}`}
                  </span>
                </div>
              )}
              <div className={styles.metaControls}>
                <select
                  className={styles.timeWindowSelect}
                  value={timeWindow.preset}
                  onChange={(e) => {
                    const preset = e.target.value;
                    if (preset === "custom") {
                      setTimeWindow({
                        preset: "custom",
                        from: customFrom || undefined,
                        to: customTo || undefined,
                      });
                    } else {
                      setTimeWindow({ preset });
                    }
                  }}
                  aria-label="Time window for all figures except the Character Wall catalog"
                >
                  {TIME_WINDOW_PRESETS.map((p) => (
                    <option key={p.preset} value={p.preset}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select
                  className={styles.refreshSelect}
                  value={refreshIntervalMs}
                  onChange={(e) => setRefreshIntervalMs(Number(e.target.value))}
                  aria-label="Auto-refresh interval"
                >
                  {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value === 0 ? "Auto-refresh: off" : `Auto-refresh: ${opt.label}`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={() => fetchStats()}
                  disabled={isRefreshing}
                  aria-label="Refresh stats"
                >
                  <FaSyncAlt size={13} className={isRefreshing ? styles.spinning : undefined} />
                </button>
              </div>
            </div>
          )}

          {stats && timeWindow.preset === "custom" && (
            <div className={styles.customDateBarWrap}>
              <form
                className={styles.customDateBar}
                onSubmit={(e) => {
                  e.preventDefault();
                  setTimeWindow({
                    preset: "custom",
                    from: customFrom || undefined,
                    to: customTo || undefined,
                  });
                }}
              >
                <span className={styles.customDateLabel}>Custom range:</span>
                <div className={styles.customDateInputsRow}>
                  <input
                    type="date"
                    className={styles.compactDateInput}
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    max={customTo || undefined}
                    aria-label="Start date"
                  />
                  <span className={styles.customDateSep}>to</span>
                  <input
                    type="date"
                    className={styles.compactDateInput}
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    min={customFrom || undefined}
                    aria-label="End date"
                  />
                </div>
                <button
                  type="submit"
                  className={styles.compactApplyButton}
                  disabled={!customFrom && !customTo}
                >
                  Apply
                </button>
              </form>
            </div>
          )}
        </div>

        {status === "loading" && <p className={styles.state}>Loading session…</p>}
        {status === "unauthenticated" && <p className={styles.state}>Not signed in.</p>}
        {status === "authenticated" && error && <p className={styles.state}>{error}</p>}
        {status === "authenticated" && !error && !stats && (
          <p className={styles.state}>Loading stats…</p>
        )}

        {stats && (
          <>
            <div
              className={styles.viewTabs}
              role="tablist"
              aria-label="Stats section"
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "game"
                    : event.key === "End"
                      ? "characters"
                      : activeView === "game"
                        ? "characters"
                        : "game";
                setActiveView(next);
                document
                  .getElementById(`${next === "game" ? "game" : "character"}-stats-tab`)
                  ?.focus();
              }}
            >
              <button
                id="game-stats-tab"
                type="button"
                role="tab"
                aria-selected={activeView === "game"}
                aria-controls="game-stats-panel"
                tabIndex={activeView === "game" ? 0 : -1}
                className={`${styles.viewTab} ${activeView === "game" ? styles.viewTabActive : ""}`}
                onClick={() => setActiveView("game")}
              >
                Guessing game
              </button>
              <button
                id="character-stats-tab"
                type="button"
                role="tab"
                aria-selected={activeView === "characters"}
                aria-controls="character-stats-panel"
                tabIndex={activeView === "characters" ? 0 : -1}
                className={`${styles.viewTab} ${activeView === "characters" ? styles.viewTabActive : ""}`}
                onClick={() => setActiveView("characters")}
              >
                Character conversations
              </button>
            </div>
            {activeView === "game" && <GameStatsPanel stats={stats} />}
            {activeView === "characters" && <CharacterStatsPanel stats={stats} />}
          </>
        )}
      </div>
    </>
  );
}

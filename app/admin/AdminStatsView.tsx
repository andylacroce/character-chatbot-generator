"use client";

/**
 * Internal, admin-only view of aggregate usage stats from `analytics_events` (and
 * bots/messages counts). Rendered only for a confirmed admin — app/admin/page.tsx (a
 * Server Component) 404s everyone else before this ever mounts, so nothing here is
 * reachable client-side by a non-admin visitor in the first place.
 *
 * The `useSession` check below is a defensive fallback for state changing *after*
 * mount (e.g. the admin signs out in another tab) — GET /api/admin/stats (see
 * src/utils/isAdmin.ts) remains the actual data-access boundary either way, so nothing
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

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FaSyncAlt, FaHome } from "react-icons/fa";
import { authenticatedFetch } from "../../src/utils/api";
import { formatRelativeTime } from "../../src/utils/formatRelativeTime";
import AdminActivityChart, { type DailyActivityRow } from "../components/AdminActivityChart";
import GameActivityChart, { type GameDailyActivityRow } from "../components/GameActivityChart";
import AppHeader from "../components/AppHeader";
import { useAccountMenu } from "../components/useAccountMenu";
import styles from "../components/styles/AdminStats.module.css";

// The admin-stats rate limiter allows 20 req/min/IP (see pages/api/admin/stats.ts) — even
// the fastest option here (every 15s) stays well under that.
const REFRESH_INTERVAL_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "15s", value: 15_000 },
  { label: "30s", value: 30_000 },
  { label: "1m", value: 60_000 },
  { label: "5m", value: 300_000 },
];
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

interface AdminStats {
  environment: string;
  generatedAt: string;
  totals: { bots: number; messages: number; avgMessagesPerBot: number };
  activity: { createdToday: number; createdLast7Days: number; daily: DailyActivityRow[] };
  funnel: { validated: number; blocked: number; created: number; creationRatePct: number | null };
  validation: {
    byWarningLevel: { warningLevel: string; total: number }[];
    unrecognizedCount: number;
    unrecognizedPct: number | null;
  };
  creators: { guestCount: number; signedInCount: number; guestPct: number | null };
  avatars: {
    byProvider: { provider: string; total: number; pct: number }[];
    fallbackRatePct: number | null;
  };
  game: {
    starts: number;
    startedToday: number;
    startedLast7Days: number;
    guestStarts: number;
    guestPct: number | null;
    correctGuesses: number;
    wrongGuesses: number;
    guessAccuracyPct: number | null;
    continuedRounds: number;
    continuationPct: number | null;
    endedByWrongGuess: number;
    endedByGiveUp: number;
    avgFinalStreak: number | null;
    bestStreak: number;
    finalStreaks: { zero: number; one: number; twoToFour: number; fiveOrMore: number };
    daily: GameDailyActivityRow[];
  };
}

const WARNING_LEVEL_LABELS: Record<string, string> = {
  none: "No concern",
  caution: "Caution (possible trademark)",
  warning: "Warning (clear violation)",
  unknown: "Unknown",
};

const PROVIDER_LABELS: Record<string, string> = {
  cache: "Reused from cache",
  cloudflare: "Cloudflare Workers AI",
  pollinations: "Pollinations.ai",
  none: "None — silhouette fallback",
  unknown: "Unknown",
};

/** Renders a percentage, or an em dash when there's no denominator to compute one from. */
function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/** Percentage of `count` within `total`, rounded to one decimal, or null when total is 0. */
function pct(count: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((count / total) * 1000) / 10;
}

/** Admin stats view — see module doc above for the access-control story. */
export default function AdminStatsView() {
  const { status } = useSession();
  const { menuItems, modals } = useAccountMenu();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(DEFAULT_REFRESH_INTERVAL_MS);
  const [activeView, setActiveView] = useState<"game" | "characters">("game");
  const isMountedRef = useRef(true);
  // A pure re-render tick — formatRelativeTime(stats.generatedAt) re-derives its string
  // from Date.now() on every render, but without something forcing a render between
  // fetches, "Updated 3s ago" would stay frozen at whatever it said when the data last
  // arrived (up to a full refresh interval later) instead of counting up live.
  const [, tick] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
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
    if (status !== "authenticated") return;
    fetchStats();
    if (refreshIntervalMs <= 0) return;
    const interval = setInterval(fetchStats, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [status, fetchStats, refreshIntervalMs]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
        center={<h1 className={styles.title}>Internal stats</h1>}
      />
      {modals}
      <div className={styles.page}>
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
                  <span>
                    {isRefreshing
                      ? "Refreshing…"
                      : `Updated ${formatRelativeTime(stats.generatedAt)}`}
                  </span>
                </div>
              )}
              <div className={styles.metaControls}>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={() => fetchStats()}
                  disabled={isRefreshing}
                  aria-label="Refresh stats"
                >
                  <FaSyncAlt size={13} className={isRefreshing ? styles.spinning : undefined} />
                </button>
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
              </div>
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
                Character creation
              </button>
            </div>
            {activeView === "game" && (
              <section
                id="game-stats-panel"
                className={styles.dashboardSection}
                role="tabpanel"
                aria-labelledby="game-stats-tab"
              >
                <div className={styles.gameSectionHeading}>
                  <div>
                    <h2 id="game-stats-title" className={styles.gameTitle}>
                      Guessing game
                    </h2>
                    <p className={styles.sectionHint}>
                      All-time totals across guests and signed-in users
                    </p>
                  </div>
                </div>
                <div className={styles.statGrid}>
                  <div className={styles.statTile}>
                    <p className={styles.statLabel}>Runs started</p>
                    <p className={styles.statValue}>{stats.game.starts}</p>
                    <p className={styles.statSub}>
                      {stats.game.startedToday} today · {stats.game.startedLast7Days} last 7 days
                    </p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.statLabel}>Guess accuracy</p>
                    <p className={styles.statValue}>{formatPct(stats.game.guessAccuracyPct)}</p>
                    <p className={styles.statSub}>
                      {stats.game.correctGuesses} correct · {stats.game.wrongGuesses} wrong
                    </p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.statLabel}>Average final streak</p>
                    <p className={styles.statValue}>{stats.game.avgFinalStreak ?? "—"}</p>
                    <p className={styles.statSub}>Across recorded run endings</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.statLabel}>Best streak reached</p>
                    <p className={styles.statValue}>{stats.game.bestStreak}</p>
                    <p className={styles.statSub}>Correct guesses in one run</p>
                  </div>
                </div>
                <div className={styles.mainGrid}>
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Game activity</h3>
                    <GameActivityChart data={stats.game.daily} />
                  </div>
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>How runs progress</h3>
                    <dl className={styles.gameFacts}>
                      <div>
                        <dt>Guest starts</dt>
                        <dd>
                          {stats.game.guestStarts} ({formatPct(stats.game.guestPct)})
                        </dd>
                      </div>
                      <div>
                        <dt>Rounds continued</dt>
                        <dd>
                          {stats.game.continuedRounds} ({formatPct(stats.game.continuationPct)} of
                          correct guesses)
                        </dd>
                      </div>
                      <div>
                        <dt>Ended after two wrong guesses</dt>
                        <dd>{stats.game.endedByWrongGuess}</dd>
                      </div>
                      <div>
                        <dt>Gave up</dt>
                        <dd>{stats.game.endedByGiveUp}</dd>
                      </div>
                    </dl>
                    <h4 className={styles.gameSubheading}>Final streaks</h4>
                    <div className={styles.gameStreakGrid}>
                      <span>
                        0 wins <strong>{stats.game.finalStreaks.zero}</strong>
                      </span>
                      <span>
                        1 win <strong>{stats.game.finalStreaks.one}</strong>
                      </span>
                      <span>
                        2–4 wins <strong>{stats.game.finalStreaks.twoToFour}</strong>
                      </span>
                      <span>
                        5+ wins <strong>{stats.game.finalStreaks.fiveOrMore}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}
            {activeView === "characters" && (
              <section
                id="character-stats-panel"
                className={styles.dashboardSection}
                role="tabpanel"
                aria-labelledby="character-stats-tab"
              >
                <div className={styles.gameSectionHeading}>
                  <div>
                    <h2 className={styles.groupHeading}>Character creation</h2>
                    <p className={styles.sectionHint}>Creation activity and saved conversations</p>
                  </div>
                </div>
                <div className={styles.statGrid}>
                  <div className={styles.statTile}>
                    <p className={styles.statLabel}>Saved characters</p>
                    <p className={styles.statValue}>{stats.totals.bots}</p>
                    <p className={styles.statSub}>Signed-in users, persisted</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.statLabel}>Persisted messages</p>
                    <p className={styles.statValue}>{stats.totals.messages}</p>
                    <p className={styles.statSub}>{stats.totals.avgMessagesPerBot} avg per bot</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.statLabel}>Created today</p>
                    <p className={styles.statValue}>{stats.activity.createdToday}</p>
                    <p className={styles.statSub}>Guests + signed-in</p>
                  </div>
                  <div className={styles.statTile}>
                    <p className={styles.statLabel}>Created last 7 days</p>
                    <p className={styles.statValue}>{stats.activity.createdLast7Days}</p>
                    <p className={styles.statSub}>Guests + signed-in</p>
                  </div>
                </div>

                <div className={styles.mainGrid}>
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Daily activity</h3>
                    <AdminActivityChart data={stats.activity.daily} />
                  </div>

                  <div className={`${styles.section} ${styles.funnelCard}`}>
                    <h2 className={styles.sectionTitle}>Creation funnel</h2>
                    <div className={styles.funnel}>
                      <div className={styles.funnelStage}>
                        <div className={styles.funnelValue}>{stats.funnel.validated}</div>
                        <div className={styles.funnelLabel}>Names validated</div>
                      </div>
                      <div className={styles.funnelArrow}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path
                            d="M4 12h14M13 6l6 6-6 6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {formatPct(stats.funnel.creationRatePct)}
                      </div>
                      <div className={styles.funnelStage}>
                        <div className={styles.funnelValue}>{stats.funnel.created}</div>
                        <div className={styles.funnelLabel}>Characters created</div>
                      </div>
                    </div>
                    <div className={styles.calloutRow}>
                      <span className={styles.callout}>
                        {stats.funnel.blocked} name{stats.funnel.blocked === 1 ? "" : "s"} blocked
                        as abusive ({formatPct(pct(stats.funnel.blocked, stats.funnel.validated))})
                      </span>
                      <span className={styles.callout}>
                        {stats.validation.unrecognizedCount} original character
                        {stats.validation.unrecognizedCount === 1 ? "" : "s"} (
                        {formatPct(stats.validation.unrecognizedPct)} of validated names)
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.breakdownGrid}>
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Copyright/trademark outcomes</h2>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Outcome</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.validation.byWarningLevel.length === 0 ? (
                          <tr>
                            <td colSpan={2}>No data yet.</td>
                          </tr>
                        ) : (
                          stats.validation.byWarningLevel.map((row) => (
                            <tr key={row.warningLevel}>
                              <td>{WARNING_LEVEL_LABELS[row.warningLevel] ?? row.warningLevel}</td>
                              <td>{row.total}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Who&apos;s creating characters</h2>
                    <div
                      className={styles.splitBar}
                      role="img"
                      aria-label={`${formatPct(stats.creators.guestPct)} guests, rest signed in`}
                    >
                      <div
                        className={styles.splitBarGuest}
                        style={{ width: `${stats.creators.guestPct ?? 0}%` }}
                      />
                      <div className={styles.splitBarSignedIn} style={{ flex: 1 }} />
                    </div>
                    <div className={styles.splitLegend}>
                      <span className={styles.splitLegendItem}>
                        <span className={`${styles.splitSwatch} ${styles.splitBarGuest}`} />
                        Guests: {stats.creators.guestCount} ({formatPct(stats.creators.guestPct)})
                      </span>
                      <span className={styles.splitLegendItem}>
                        <span className={`${styles.splitSwatch} ${styles.splitBarSignedIn}`} />
                        Signed-in: {stats.creators.signedInCount}
                      </span>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Avatar generation</h2>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Provider</th>
                          <th>Count</th>
                          <th>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.avatars.byProvider.length === 0 ? (
                          <tr>
                            <td colSpan={3}>No data yet.</td>
                          </tr>
                        ) : (
                          stats.avatars.byProvider.map((row) => (
                            <tr key={row.provider}>
                              <td>{PROVIDER_LABELS[row.provider] ?? row.provider}</td>
                              <td>{row.total}</td>
                              <td>{row.pct}%</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    {stats.avatars.fallbackRatePct !== null &&
                      stats.avatars.fallbackRatePct > 0 && (
                        <div className={styles.calloutRow}>
                          <span className={styles.calloutWarn}>
                            {formatPct(stats.avatars.fallbackRatePct)} of requests fell back to the
                            plain silhouette — no provider returned an image
                          </span>
                        </div>
                      )}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

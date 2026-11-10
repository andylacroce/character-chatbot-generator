import { getCharacterCategoryLabel } from "character-chatbot-shared";
import React from "react";
import AdminActivityChart from "../components/admin/AdminActivityChart";
import styles from "../components/styles/AdminStats.module.css";
import {
  AdminStats,
  WARNING_LEVEL_LABELS,
  PROVIDER_LABELS,
  describeWindow,
  formatPct,
  pct,
} from "./adminStatsTypes";

/** The character-conversations tab of the admin stats view. */
export function CharacterStatsPanel({ stats }: { stats: AdminStats }) {
  const avatarTotal = stats.avatars.byProvider.reduce((sum, row) => sum + row.total, 0);
  const cacheHits = stats.avatars.byProvider.find((row) => row.provider === "cache")?.total ?? 0;

  return (
    <section
      id="character-stats-panel"
      className={styles.dashboardSection}
      role="tabpanel"
      aria-labelledby="character-stats-tab"
    >
      <div className={styles.gameSectionHeading}>
        <div>
          <h2 className={styles.groupHeading}>Character conversations</h2>
          <p className={styles.sectionHint}>
            Figures cover {describeWindow(stats.timeWindow)}, except the Character Wall catalog.
            Funnel and creator counts come from event logs (guests included); saved characters and
            messages are signed-in users only.
          </p>
        </div>
      </div>
      <div className={styles.statGrid}>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Saved characters</p>
          <p className={styles.statValue}>{stats.totals.bots}</p>
          <p className={styles.statSub}>Signed-in users only</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Saved messages</p>
          <p className={styles.statValue}>{stats.totals.messages}</p>
          <p className={styles.statSub}>{stats.totals.avgMessagesPerBot} per saved character</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Characters created today</p>
          <p className={styles.statValue}>{stats.activity.createdToday}</p>
          <p className={styles.statSub}>Guests + signed-in</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Created in the last 7 days</p>
          <p className={styles.statValue}>{stats.activity.createdLast7Days}</p>
          <p className={styles.statSub}>Guests + signed-in</p>
        </div>
      </div>

      <div className={styles.mainGrid}>
        <div className={`${styles.section} ${styles.chartSection}`}>
          <h3 className={styles.sectionTitle}>Daily activity</h3>
          <AdminActivityChart data={stats.activity.daily} endDay={stats.timeWindow.to} />
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
                <path d="M4 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
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
              {stats.funnel.blocked} name{stats.funnel.blocked === 1 ? "" : "s"} blocked as abusive
              ({formatPct(pct(stats.funnel.blocked, stats.funnel.validated))})
            </span>
            <span className={styles.callout}>
              {stats.validation.unrecognizedCount} unsupported name
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
          <h2 className={styles.sectionTitle}>Who&apos;s starting conversations</h2>
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
          <div className={styles.calloutRow}>
            {cacheHits > 0 && (
              <span className={styles.callout}>
                {cacheHits} of {avatarTotal} portraits ({formatPct(pct(cacheHits, avatarTotal))})
                came from the cache instead of a new image generation
              </span>
            )}
            {stats.avatars.fallbackRatePct !== null && stats.avatars.fallbackRatePct > 0 && (
              <span className={styles.calloutWarn}>
                {formatPct(stats.avatars.fallbackRatePct)} of requests fell back to the plain
                silhouette — no provider returned an image
              </span>
            )}
          </div>
        </div>

        {stats.catalog.byCategory.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Character Wall catalog (all time)</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Portraits</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {stats.catalog.byCategory.map((row) => (
                  <tr key={row.category}>
                    <td>{getCharacterCategoryLabel(row.category)}</td>
                    <td>{row.total}</td>
                    <td>{row.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.calloutRow}>
              <span className={styles.callout}>
                {stats.catalog.totalCached} cached portraits in total; not affected by the time
                window
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

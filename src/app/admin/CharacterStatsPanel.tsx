import React from "react";
import AdminActivityChart from "../components/admin/AdminActivityChart";
import styles from "../components/styles/AdminStats.module.css";
import {
  AdminStats,
  WARNING_LEVEL_LABELS,
  PROVIDER_LABELS,
  formatPct,
  pct,
} from "./adminStatsTypes";

/** The character-conversations tab of the admin stats view. */
export function CharacterStatsPanel({ stats }: { stats: AdminStats }) {
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
          <p className={styles.sectionHint}>Conversation launches and saved chats</p>
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
          <p className={styles.statLabel}>Started today</p>
          <p className={styles.statValue}>{stats.activity.createdToday}</p>
          <p className={styles.statSub}>Guests + signed-in</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statLabel}>Started last 7 days</p>
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
          {stats.avatars.fallbackRatePct !== null && stats.avatars.fallbackRatePct > 0 && (
            <div className={styles.calloutRow}>
              <span className={styles.calloutWarn}>
                {formatPct(stats.avatars.fallbackRatePct)} of requests fell back to the plain
                silhouette — no provider returned an image
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

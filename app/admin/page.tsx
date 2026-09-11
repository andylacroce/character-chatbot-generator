"use client";

/**
 * Internal, admin-only view of aggregate usage stats from `analytics_events` (and
 * bots/messages counts). Not linked from any nav — reached by navigating directly to
 * /admin, the same way /reference (API docs) is reachable but unlinked.
 *
 * The `useSession` check here is UX only (avoid flashing data while loading, show a
 * friendly message for a non-admin) — the real access boundary is server-side in
 * GET /api/admin/stats (see src/utils/isAdmin.ts), so nothing sensitive is ever
 * server-rendered or present in this page's shell for a non-admin visitor.
 */

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../src/utils/api";
import styles from "../components/styles/LegalPage.module.css";

interface CountRow {
  total: number;
  [key: string]: string | number | null;
}

interface AdminStats {
  eventCounts: CountRow[];
  dailyCounts: CountRow[];
  avatarProviders: CountRow[];
  validationOutcomes: CountRow[];
  botCreators: CountRow[];
  totals: { bots: number; messages: number };
}

/** Renders a labeled group of count rows as a simple key/total table. */
function CountTable({
  title,
  rows,
  labelKey,
}: {
  title: string;
  rows: CountRow[];
  labelKey: string;
}) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {rows.length === 0 ? (
        <p>No data yet.</p>
      ) : (
        <ul>
          {rows.map((row, i) => (
            <li key={i}>
              {String(row[labelKey] ?? "(none)")}: {row.total}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Admin-only internal stats page — see module doc above for the access-control story. */
export default function AdminStatsPage() {
  const { status } = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    authenticatedFetch("/api/admin/stats")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? "Not authorized." : "Failed to load stats.");
          return;
        }
        setStats(await res.json());
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load stats.");
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Internal stats</h1>

      {status === "loading" && <p>Loading session…</p>}
      {status === "unauthenticated" && <p>Not signed in.</p>}
      {status === "authenticated" && error && <p>{error}</p>}
      {status === "authenticated" && !error && !stats && <p>Loading stats…</p>}

      {stats && (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Totals</h2>
            <ul>
              <li>Saved characters (bots): {stats.totals.bots}</li>
              <li>Persisted messages: {stats.totals.messages}</li>
            </ul>
          </div>
          <CountTable title="Events (all-time)" rows={stats.eventCounts} labelKey="name" />
          <CountTable
            title="Events per day (last 30 days)"
            rows={stats.dailyCounts}
            labelKey="day"
          />
          <CountTable
            title="Avatar provider outcomes"
            rows={stats.avatarProviders}
            labelKey="provider"
          />
          <CountTable
            title="Character validation outcomes"
            rows={stats.validationOutcomes}
            labelKey="warningLevel"
          />
          <CountTable
            title="Bot creators (guest vs signed-in)"
            rows={stats.botCreators}
            labelKey="guest"
          />
        </>
      )}
    </div>
  );
}

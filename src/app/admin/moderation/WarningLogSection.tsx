"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { FaCheck, FaBan } from "react-icons/fa";
import { authenticatedFetch } from "../../../utils/api";
import { formatRelativeTime } from "character-chatbot-shared";
import styles from "../../components/styles/AdminModeration.module.css";

interface WarningLogEntry {
  characterName: string;
  displayName: string | null;
  reason: string | null;
  createdAt: string;
}

/**
 * Time-window options for the warning log's filter. Independent of the Allowed/Blocked
 * lists below — those are deduplicated, current-state tables (a name only ever appears
 * once, and disappears entirely once removed), so they can't answer "what has Claude
 * warned about in the last X" once a name has been un-blocked or allowlisted. This
 * section reads from character_warning_log instead, an append-only record of every
 * warning-level classification Claude has ever returned, independent of whatever
 * action (if any) was later taken on it.
 */
const TIME_WINDOWS = [
  { label: "Last hour", ms: 60 * 60 * 1000 },
  { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "All time", ms: 0 },
];

/**
 * Read-only log of every name Claude has classified as a copyright/trademark
 * "warning", filterable by how recently it was flagged, with one-click actions to
 * send a name to the Allowed or Blocked list above — independent of whether that name
 * is currently on either list already (see TIME_WINDOWS doc above for why this can't
 * just be a filtered view of the Blocked list).
 */
export function WarningLogSection({ onChanged }: { onChanged: () => void }) {
  const { status } = useSession();
  const [entries, setEntries] = useState<WarningLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowMs, setWindowMs] = useState(TIME_WINDOWS[1].ms); // default: last 24 hours
  const [actioned, setActioned] = useState<Record<string, "allowed" | "blocked">>({});
  const [busyName, setBusyName] = useState<string | null>(null);
  // A stable, state-held "now" rather than calling Date.now() directly during render
  // (React's purity rule flags that as an impure call) — refreshed periodically since
  // this filter only needs to be roughly current, not live-ticking.
  const [now, setNow] = useState(() => Date.now());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/admin/warnings");
      if (!isMountedRef.current) return;
      if (!res.ok) {
        setError(res.status === 403 ? "Not authorized." : "Failed to load warnings.");
        return;
      }
      const data = await res.json();
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
      setError(null);
    } catch {
      if (isMountedRef.current) setError("Failed to load warnings.");
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (status !== "authenticated") return;
    fetchEntries();
  }, [status, fetchEntries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAction = useCallback(
    async (characterName: string, action: "allowed" | "blocked") => {
      setBusyName(characterName);
      try {
        const res = await authenticatedFetch(
          action === "allowed" ? "/api/admin/allowlist" : "/api/admin/blocklist",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: characterName }),
          },
        );
        if (res.ok && isMountedRef.current) {
          setActioned((prev) => ({ ...prev, [characterName]: action }));
          onChanged();
        }
      } finally {
        if (isMountedRef.current) setBusyName(null);
      }
    },
    [onChanged],
  );

  const filteredEntries =
    entries && windowMs > 0
      ? entries.filter((entry) => now - new Date(entry.createdAt).getTime() <= windowMs)
      : entries;

  return (
    <div className={`${styles.section} ${styles.warningLogSection}`}>
      <h2 className={styles.sectionTitle}>
        Recently warned
        {filteredEntries ? ` (${filteredEntries.length})` : ""}
      </h2>
      <p className={styles.sectionHint}>
        Every name Claude has classified as a copyright/trademark &quot;warning&quot;, regardless of
        whether it&apos;s currently allowed, blocked, or neither.
      </p>

      <select
        className={styles.timeFilter}
        value={windowMs}
        onChange={(e) => setWindowMs(Number(e.target.value))}
        aria-label="Filter by when flagged"
      >
        {TIME_WINDOWS.map((w) => (
          <option key={w.label} value={w.ms}>
            {w.label}
          </option>
        ))}
      </select>

      {error && <p className={styles.errorText}>{error}</p>}

      {!filteredEntries ? (
        <p className={styles.state}>Loading…</p>
      ) : filteredEntries.length === 0 ? (
        <p className={styles.state}>No warnings in this window.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colName}>Name</th>
                <th className={styles.colReason}>Reason</th>
                <th className={styles.colMeta}>Flagged</th>
                <th className={styles.colActions}></th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry, i) => {
                const action = actioned[entry.characterName];
                return (
                  <tr key={`${entry.characterName}-${i}`}>
                    <td className={styles.colName} title={entry.displayName ?? entry.characterName}>
                      {entry.displayName ?? entry.characterName}
                    </td>
                    <td
                      className={`${styles.reasonCell} ${styles.colReason}`}
                      title={entry.reason ?? undefined}
                    >
                      {entry.reason ?? "—"}
                    </td>
                    <td className={styles.colMeta}>{formatRelativeTime(entry.createdAt)}</td>
                    <td className={styles.colActions}>
                      {action ? (
                        <span className={styles.sourceBadge}>{action}</span>
                      ) : (
                        <div className={styles.warningActions}>
                          <button
                            type="button"
                            className={styles.listAddButton}
                            onClick={() => handleAction(entry.characterName, "allowed")}
                            disabled={busyName === entry.characterName}
                            aria-label="Allow"
                            title="Allow"
                          >
                            <FaCheck size={12} />
                            <span className={styles.buttonLabel}>Allow</span>
                          </button>
                          <button
                            type="button"
                            className={styles.removeButton}
                            onClick={() => handleAction(entry.characterName, "blocked")}
                            disabled={busyName === entry.characterName}
                            aria-label="Block"
                            title="Block"
                          >
                            <FaBan size={12} />
                            <span className={styles.buttonLabel}>Block</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

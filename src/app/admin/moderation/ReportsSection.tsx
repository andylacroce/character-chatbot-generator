"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { REPORT_REASONS, formatRelativeTime } from "character-chatbot-shared";
import { authenticatedFetch } from "../../../utils/api";
import styles from "../../components/styles/AdminModeration.module.css";

interface ReportEntry {
  id: number;
  targetType: string;
  characterName: string;
  messageText: string | null;
  reason: string;
  details: string | null;
  createdAt: string;
}

type ReportAction = "block" | "purge" | "dismiss";

/** Sends the admin request an action implies; resolving the report afterward is the caller's job. */
function actionRequest(action: ReportAction, name: string): Promise<Response> | null {
  const json = { "Content-Type": "application/json" };
  if (action === "block") {
    return authenticatedFetch("/api/admin/blocklist", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name, reason: "User report" }),
    });
  }
  if (action === "purge") {
    return authenticatedFetch("/api/admin/characters", {
      method: "DELETE",
      headers: json,
      body: JSON.stringify({ name }),
    });
  }
  return null;
}

/**
 * Queue of open "Report a problem" reports. Block (blocklist + scrub everywhere) and Purge
 * portrait reuse the existing admin routes; every action then resolves the report, and Dismiss
 * resolves it with no other action.
 */
export function ReportsSection({ onChanged }: { onChanged: () => void }) {
  const { status } = useSession();
  const [entries, setEntries] = useState<ReportEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await authenticatedFetch("/api/admin/reports");
      if (!isMountedRef.current) return;
      if (!res.ok) {
        setError(res.status === 403 ? "Not authorized." : "Failed to load reports.");
        return;
      }
      const data = await res.json();
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
      setError(null);
    } catch {
      if (isMountedRef.current) setError("Failed to load reports.");
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (status !== "authenticated") return;
    fetchEntries();
  }, [status, fetchEntries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAction = useCallback(
    async (entry: ReportEntry, action: ReportAction) => {
      setBusyId(entry.id);
      try {
        const acted = await actionRequest(action, entry.characterName);
        if (acted && !acted.ok) {
          if (isMountedRef.current) setError(`Couldn't ${action} ${entry.characterName}.`);
          return;
        }
        const res = await authenticatedFetch("/api/admin/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id }),
        });
        if (!res.ok || !isMountedRef.current) return;
        setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null);
        setError(null);
        if (action !== "dismiss") onChanged();
      } finally {
        if (isMountedRef.current) setBusyId(null);
      }
    },
    [onChanged],
  );

  return (
    <div className={`${styles.section} ${styles.warningLogSection}`}>
      <h2 className={styles.sectionTitle}>
        Reported problems{entries ? ` (${entries.length})` : ""}
      </h2>
      <p className={styles.sectionHint}>
        Submitted from the Character Wall, character pages, and chat. Block a name to remove it
        everywhere, purge a bad portrait so it regenerates, or dismiss.
      </p>

      {error && <p className={styles.errorText}>{error}</p>}

      {!entries ? (
        <p className={styles.state}>Loading…</p>
      ) : entries.length === 0 ? (
        <p className={styles.state}>No open reports.</p>
      ) : (
        <ul className={styles.reportList}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.reportItem}>
              <div className={styles.reportHead}>
                {/* The Wall opens this character's lightbox (portrait plus the admin controls) from ?name=. */}
                <a
                  href={`/characters?name=${encodeURIComponent(entry.characterName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.reportLink}
                >
                  {entry.characterName}
                </a>
                <span className={styles.sourceBadge}>
                  {entry.targetType === "message" ? "reply" : "character"}
                </span>
                <span className={styles.sourceBadge}>
                  {REPORT_REASONS.find((r) => r.value === entry.reason)?.label ?? entry.reason}
                </span>
                <span>{formatRelativeTime(entry.createdAt)}</span>
              </div>
              {entry.messageText && (
                <blockquote className={styles.reportQuote}>{entry.messageText}</blockquote>
              )}
              {entry.details && <p className={styles.reportDetails}>{entry.details}</p>}
              <div className={styles.warningActions}>
                <button
                  type="button"
                  className={styles.removeButton}
                  disabled={busyId === entry.id}
                  onClick={() => handleAction(entry, "block")}
                >
                  Block name
                </button>
                <button
                  type="button"
                  className={styles.listAddButton}
                  disabled={busyId === entry.id}
                  onClick={() => handleAction(entry, "purge")}
                >
                  Purge portrait
                </button>
                <button
                  type="button"
                  className={styles.listAddButton}
                  disabled={busyId === entry.id}
                  onClick={() => handleAction(entry, "dismiss")}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

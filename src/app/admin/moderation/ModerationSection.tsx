"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { FaExchangeAlt, FaTimes } from "react-icons/fa";
import { authenticatedFetch } from "../../../utils/api";
import { formatRelativeTime } from "character-chatbot-shared";
import styles from "../../components/styles/AdminModeration.module.css";

interface ListEntry {
  characterName: string;
  displayName: string | null;
  reason: string | null;
  source: string;
  createdAt: string;
}

interface ModerationSectionProps {
  title: string;
  hint: string;
  apiPath: string;
  namePlaceholder: string;
  addButtonLabel: string;
  removeButtonLabel: string;
  emptyMessage: string;
  /**
   * The other list's API path + button label — lets a row move directly to the other
   * list (e.g. "Move to Blocked" on an Allowed row) instead of only being removable.
   * POSTing to either list's endpoint already removes the name from the other one
   * server-side (see app/api/admin/{allowlist,blocklist}/route.ts), so this is just that
   * same POST from the opposite direction, then a refetch of *this* list.
   */
  transferTo: { apiPath: string; label: string };
  /**
   * Bumped by the parent whenever *any* section (either list, or a Warning Log
   * action) successfully changes either list — since a name moving from Allowed to
   * Blocked (or vice versa, or via the Warning Log's Allow/Block buttons) affects a
   * list this component doesn't own, this section needs to refetch even when the
   * change didn't originate here. Included as a fetch-effect dependency below.
   */
  refreshKey: number;
  /** Called after this section successfully changes either list, so siblings refresh too. */
  onChanged: () => void;
}

/**
 * One list's table + add-form, reused for both the allowlist and blocklist sections
 * below — same fetch/add/remove shape against whichever `apiPath` it's given.
 */
export function ModerationSection({
  title,
  hint,
  apiPath,
  namePlaceholder,
  addButtonLabel,
  removeButtonLabel,
  emptyMessage,
  transferTo,
  refreshKey,
  onChanged,
}: ModerationSectionProps) {
  const { status } = useSession();
  const [entries, setEntries] = useState<ListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newReason, setNewReason] = useState("");
  const [busy, setBusy] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await authenticatedFetch(apiPath);
      if (!isMountedRef.current) return;
      if (!res.ok) {
        setError(res.status === 403 ? "Not authorized." : "Failed to load.");
        return;
      }
      const data = await res.json();
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
      setError(null);
    } catch {
      if (isMountedRef.current) setError("Failed to load.");
    }
  }, [apiPath]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (status !== "authenticated") return;
    fetchEntries();
    // refreshKey is intentionally a dependency: any section's successful mutation
    // bumps it, so every section (including this one, redundantly but harmlessly)
    // refetches — see the prop doc above.
  }, [status, fetchEntries, refreshKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName.trim() || busy) return;
      setBusy(true);
      try {
        const res = await authenticatedFetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim(), reason: newReason.trim() }),
        });
        if (res.ok) {
          setNewName("");
          setNewReason("");
          await fetchEntries();
          onChanged();
        } else {
          setError("Failed to add that name.");
        }
      } catch {
        setError("Failed to add that name.");
      } finally {
        if (isMountedRef.current) setBusy(false);
      }
    },
    [apiPath, newName, newReason, busy, fetchEntries, onChanged],
  );

  const handleRemove = useCallback(
    async (characterName: string) => {
      setBusy(true);
      try {
        const res = await authenticatedFetch(apiPath, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: characterName }),
        });
        if (res.ok) {
          await fetchEntries();
          onChanged();
        } else {
          setError("Failed to remove that name.");
        }
      } catch {
        setError("Failed to remove that name.");
      } finally {
        if (isMountedRef.current) setBusy(false);
      }
    },
    [apiPath, fetchEntries, onChanged],
  );

  const handleTransfer = useCallback(
    async (characterName: string) => {
      setBusy(true);
      try {
        const res = await authenticatedFetch(transferTo.apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: characterName }),
        });
        if (res.ok) {
          await fetchEntries();
          onChanged();
        } else {
          setError(`Failed to ${transferTo.label.toLowerCase()}.`);
        }
      } catch {
        setError(`Failed to ${transferTo.label.toLowerCase()}.`);
      } finally {
        if (isMountedRef.current) setBusy(false);
      }
    },
    [transferTo, fetchEntries, onChanged],
  );

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {title}
        {entries ? ` (${entries.length})` : ""}
      </h2>
      <p className={styles.sectionHint}>{hint}</p>

      {error && <p className={styles.errorText}>{error}</p>}

      <form onSubmit={handleAdd} className={styles.listForm}>
        <input
          type="text"
          placeholder={namePlaceholder}
          aria-label={namePlaceholder}
          className={styles.listInput}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={100}
        />
        <input
          type="text"
          placeholder="Reason (optional)"
          aria-label={`Reason for ${title.toLowerCase()}`}
          className={styles.listInput}
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
          maxLength={200}
        />
        <button type="submit" className={styles.listAddButton} disabled={!newName.trim() || busy}>
          {addButtonLabel}
        </button>
      </form>

      {!entries ? (
        <p className={styles.state}>Loading…</p>
      ) : entries.length === 0 ? (
        <p className={styles.state}>{emptyMessage}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colName}>Name</th>
                <th className={styles.colReason}>Reason</th>
                <th className={styles.colMeta}>Source</th>
                <th className={styles.colMeta}>Added</th>
                <th className={styles.colActions}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.characterName}>
                  <td className={styles.colName} title={entry.displayName ?? entry.characterName}>
                    {entry.displayName ?? entry.characterName}
                  </td>
                  <td
                    className={`${styles.reasonCell} ${styles.colReason}`}
                    title={entry.reason ?? undefined}
                  >
                    {entry.reason ?? "—"}
                  </td>
                  <td className={`${styles.sourceBadge} ${styles.colMeta}`}>{entry.source}</td>
                  <td className={styles.colMeta}>{formatRelativeTime(entry.createdAt)}</td>
                  <td className={styles.colActions}>
                    <div className={styles.warningActions}>
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => handleTransfer(entry.characterName)}
                        disabled={busy}
                        aria-label={transferTo.label}
                        title={transferTo.label}
                      >
                        <FaExchangeAlt size={12} />
                        <span className={styles.buttonLabel}>{transferTo.label}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => handleRemove(entry.characterName)}
                        disabled={busy}
                        aria-label={removeButtonLabel}
                        title={removeButtonLabel}
                      >
                        <FaTimes size={12} />
                        <span className={styles.buttonLabel}>{removeButtonLabel}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

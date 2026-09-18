"use client";

/**
 * Internal, admin-only view managing both character lists that short-circuit
 * pages/api/validate-character.ts before it ever calls Claude: the admin-managed
 * allowlist (src/utils/characterAllowlist.ts) and the blocklist (src/utils/
 * characterBlocklist.ts). Kept on one page, not two, since they're the same
 * moderation concern from opposite directions — an admin correcting a false
 * positive (allow) or confirming/pre-empting a real violation (block) is one
 * workflow, not two. Rendered only for a confirmed admin — app/admin/moderation/
 * page.tsx (a Server Component) 404s everyone else before this ever mounts.
 *
 * Uses the same shared AppHeader/useAccountMenu every other page uses, rather than a
 * bespoke standalone masthead, so this admin page's chrome doesn't drift from the
 * rest of the app. "Back to Home" lives in the hamburger menu (not the header's
 * center slot, unlike a page with real focal content there) since this page has
 * nothing else to put there.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FaHome, FaExchangeAlt, FaTimes, FaCheck, FaBan } from "react-icons/fa";
import { authenticatedFetch } from "../../../src/utils/api";
import { formatRelativeTime } from "../../../src/utils/formatRelativeTime";
import AppHeader from "../../components/AppHeader";
import { useAccountMenu } from "../../components/useAccountMenu";
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
   * server-side (see pages/api/admin/{allowlist,blocklist}.ts), so this is just that
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
function ModerationSection({
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
function WarningLogSection({ onChanged }: { onChanged: () => void }) {
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

/** Admin moderation view (allowlist + blocklist) — see module doc above. */
export default function AdminModerationView() {
  const { status } = useSession();
  const { menuItems, modals } = useAccountMenu();
  // Bumped after any successful add/remove/transfer/warning-action anywhere on this
  // page, so every section refetches and shows the latest state — a change in one
  // section (e.g. the Warning Log's "Block" button) affects a list a sibling section
  // owns, which that sibling has no other way to learn about.
  const [refreshKey, setRefreshKey] = useState(0);
  const handleChanged = useCallback(() => setRefreshKey((k) => k + 1), []);

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
    <div className={styles.page}>
      <AppHeader
        menuSide="right"
        menuItems={fullMenuItems}
        center={<h1 className={styles.title}>Character moderation</h1>}
      />
      {modals}

      <div className={styles.header}>
        <p className={styles.subtitle}>
          Names here short-circuit copyright/trademark validation before it ever calls Claude — an
          allowed name is always safe, a blocked name is always rejected with a generic message,
          regardless of what a fresh classification might say.
        </p>
      </div>

      {status === "loading" && <p className={styles.state}>Loading session…</p>}
      {status === "unauthenticated" && <p className={styles.state}>Not signed in.</p>}

      {status === "authenticated" && (
        <>
          <WarningLogSection onChanged={handleChanged} />

          <div className={styles.grid}>
            <ModerationSection
              title="Allowed"
              hint="Always classified as safe (warningLevel: none), skipping Claude entirely."
              apiPath="/api/admin/allowlist"
              namePlaceholder="Character name to allow"
              addButtonLabel="Allow"
              removeButtonLabel="Remove"
              emptyMessage="No manually-allowed names."
              transferTo={{ apiPath: "/api/admin/blocklist", label: "Move to Blocked" }}
              refreshKey={refreshKey}
              onChanged={handleChanged}
            />
            <ModerationSection
              title="Blocked"
              hint="Always rejected with a generic message, skipping Claude entirely."
              apiPath="/api/admin/blocklist"
              namePlaceholder="Character name to block"
              addButtonLabel="Block"
              removeButtonLabel="Unblock"
              emptyMessage="No blocked names."
              transferTo={{ apiPath: "/api/admin/allowlist", label: "Move to Allowed" }}
              refreshKey={refreshKey}
              onChanged={handleChanged}
            />
          </div>
        </>
      )}
    </div>
  );
}

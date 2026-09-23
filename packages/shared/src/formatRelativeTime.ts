/**
 * Formats an ISO timestamp as a friendly relative time (e.g. "a few minutes ago", "yesterday").
 * Canonical copy for mobile's HistoryScreen. The web app keeps a mirrored copy in
 * src/utils/formatRelativeTime.ts until it migrates onto this package; change both together.
 */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 5) return "a few minutes ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr === 1) return "an hour ago";
  if (diffHr < 24) return `${diffHr} hours ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(iso).toLocaleDateString();
}

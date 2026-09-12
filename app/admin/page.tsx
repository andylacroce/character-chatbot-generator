/**
 * Server-side gate for the internal /admin stats view. Not linked from any nav —
 * reached by navigating directly to /admin, the same way /reference (API docs) is
 * reachable but unlinked. A non-admin visitor gets a real 404 (via next/navigation's
 * notFound(), rendered by app/not-found.tsx) rather than the stats page's shell
 * loading and then showing a "Not signed in"/"Not authorized" message — a 404 doesn't
 * even confirm this route does anything, let alone what.
 */

import { notFound } from "next/navigation";
import { isAdminSession } from "../../src/utils/isAdmin";
import AdminStatsView from "./AdminStatsView";

/** Renders the admin stats view for a confirmed admin, otherwise 404s. */
export default async function AdminPage() {
  if (!(await isAdminSession())) {
    notFound();
  }
  return <AdminStatsView />;
}

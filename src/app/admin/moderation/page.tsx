/**
 * Server-side gate for the internal /admin/moderation view (character allowlist +
 * blocklist) — same reachability and access-control shape as /admin itself
 * (app/admin/page.tsx): not linked from any nav, a non-admin visitor gets a real 404
 * rather than a page shell that then shows a "not authorized" message.
 */

import { notFound } from "next/navigation";
import { isAdminSession } from "../../../utils/isAdmin";
import AdminModerationView from "./AdminModerationView";

/** Renders the admin moderation view for a confirmed admin, otherwise 404s. */
export default async function AdminModerationPage() {
  if (!(await isAdminSession())) {
    notFound();
  }
  return <AdminModerationView />;
}

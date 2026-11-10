/**
 * Storage for "Report a problem" reports (`content_reports`), reviewed in /admin/moderation.
 * Best-effort like the other moderation aids: no-ops without DATABASE_URL and logs (never
 * throws) on a DB error. `createReport` returns whether the report was stored, so the API
 * can tell the reporter honestly.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { contentReports } from "../../db/schema";
import { getCurrentEnvironment } from "../environment";
import { safeDb } from "../safeDb";

export interface NewReport {
  targetType: string;
  characterName: string;
  messageText: string | null;
  reason: string;
  details: string | null;
  reporterUserId: string | null;
}

export interface ReportEntry {
  id: number;
  targetType: string;
  characterName: string;
  messageText: string | null;
  reason: string;
  details: string | null;
  createdAt: Date;
}

/** Stores one report for the current environment; false when it couldn't be stored. */
export function createReport(report: NewReport): Promise<boolean> {
  return safeDb("content_report_write_failed", "Report write failed", false, async () => {
    await getDb()
      .insert(contentReports)
      .values({ ...report, environment: getCurrentEnvironment() });
    return true;
  });
}

/** Open reports for the current environment, newest first. */
export function listOpenReports(): Promise<ReportEntry[]> {
  return safeDb("content_report_list_failed", "Report list failed", [], () =>
    getDb()
      .select({
        id: contentReports.id,
        targetType: contentReports.targetType,
        characterName: contentReports.characterName,
        messageText: contentReports.messageText,
        reason: contentReports.reason,
        details: contentReports.details,
        createdAt: contentReports.createdAt,
      })
      .from(contentReports)
      .where(
        and(
          eq(contentReports.environment, getCurrentEnvironment()),
          eq(contentReports.status, "open"),
        ),
      )
      .orderBy(desc(contentReports.createdAt)),
  );
}

/** Marks a report resolved (acted on or dismissed); false when it couldn't be updated. */
export function resolveReport(id: number): Promise<boolean> {
  return safeDb("content_report_resolve_failed", "Report resolve failed", false, async () => {
    await getDb()
      .update(contentReports)
      .set({ status: "resolved" })
      .where(
        and(eq(contentReports.id, id), eq(contentReports.environment, getCurrentEnvironment())),
      );
    return true;
  });
}

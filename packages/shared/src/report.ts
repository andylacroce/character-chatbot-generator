/**
 * "Report a problem": the reasons, limits, copy, and form state machine shared by the web and
 * mobile report dialogs (the form hook is in useReportForm.ts, so server code can import this
 * file without pulling in React).
 */

export const REPORT_REASONS = [
  { value: "offensive", label: "Offensive or inappropriate" },
  { value: "image", label: "Problem with the portrait" },
  { value: "inaccurate", label: "Wrong or misleading" },
  { value: "copyright", label: "Copyright or trademark" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

/** A character (its name and portrait) or one reply a character gave. */
export type ReportTargetType = "character" | "message";

export const REPORT_DETAILS_MAX = 500;
export const REPORT_MESSAGE_MAX = 1000;

/** POST /api/report body. `messageText` is required for a `message` report. */
export interface ReportRequest {
  targetType: ReportTargetType;
  characterName: string;
  reason: ReportReason;
  details?: string;
  messageText?: string;
}

export const REPORT_COPY = {
  trigger: "Report a problem",
  title: "Report a problem",
  detailsLabel: "Anything else we should know? (optional)",
  submit: "Send report",
  sending: "Sending...",
  cancel: "Cancel",
  success: "Thanks, we'll take a look.",
  error: "Couldn't send your report. Please try again.",
} as const;

/** Whether `value` is one of the report reasons. */
export function isReportReason(value: unknown): value is ReportReason {
  return REPORT_REASONS.some((r) => r.value === value);
}

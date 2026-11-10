/** Form state for the report dialogs on web and mobile; each platform supplies only `submit` and its UI. */

import { useCallback, useState } from "react";
import type { ReportReason, ReportRequest } from "./report";

export type ReportStatus = "idle" | "sending" | "sent" | "error";

/** Form state for a report dialog; `submit` throws on failure. */
export function useReportForm(submit: (body: ReportRequest) => Promise<unknown>) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<ReportStatus>("idle");

  const reset = useCallback(() => {
    setReason(null);
    setDetails("");
    setStatus("idle");
  }, []);

  const send = useCallback(
    async (target: Pick<ReportRequest, "targetType" | "characterName" | "messageText">) => {
      if (!reason || status === "sending") return;
      setStatus("sending");
      try {
        await submit({ ...target, reason, details: details.trim() || undefined });
        setStatus("sent");
      } catch {
        setStatus("error");
      }
    },
    [reason, details, status, submit],
  );

  return { reason, setReason, details, setDetails, status, send, reset };
}

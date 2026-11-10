// =============================
// ReportDialog.tsx
// "Report a problem" dialog for a character (name/portrait) or one of its replies. Shared by
// the chat screens, the Character Wall lightbox, and character pages; form state lives in
// shared `useReportForm`, which mobile's report modal also uses.
// =============================

import React, { useEffect } from "react";
import {
  REPORT_COPY,
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  useReportForm,
  type ReportRequest,
} from "character-chatbot-shared";
import { authenticatedFetch } from "../../../utils/api";
import DisclaimerStyleModal from "./DisclaimerStyleModal";
import botStyles from "../styles/BotCreator.module.css";
import styles from "../styles/ReportDialog.module.css";

/** What is being reported: the shape of the request minus the user's reason and details. */
export type ReportTarget = Pick<ReportRequest, "targetType" | "characterName" | "messageText">;

interface ReportDialogProps {
  show: boolean;
  onClose: () => void;
  target: ReportTarget | null;
}

/** POSTs a report; throws on any non-2xx so `useReportForm` shows the error state. */
async function submitReport(body: ReportRequest): Promise<void> {
  const res = await authenticatedFetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Report failed: ${res.status}`);
}

/** Modal form for reporting a problem with a character or one of its replies. */
const ReportDialog: React.FC<ReportDialogProps> = ({ show, onClose, target }) => {
  const { reason, setReason, details, setDetails, status, send, reset } =
    useReportForm(submitReport);

  // A fresh form each time the dialog opens, not the last report's leftovers.
  useEffect(() => {
    if (show) reset();
  }, [show, reset]);

  const sending = status === "sending";

  return (
    <DisclaimerStyleModal
      show={show && !!target}
      onClose={onClose}
      title={REPORT_COPY.title}
      closeLabel="Close report dialog"
      testId="report-dialog-backdrop"
    >
      {status === "sent" ? (
        <>
          <p className={botStyles.disclaimerText}>{REPORT_COPY.success}</p>
          <button type="button" className={styles.submit} onClick={onClose}>
            Close
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (target) void send(target);
          }}
        >
          <fieldset className={styles.reasons}>
            <legend className={styles.legend}>Why are you reporting this?</legend>
            {REPORT_REASONS.map(({ value, label }) => (
              <label key={value} className={styles.reason}>
                <input
                  type="radio"
                  name="report-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label className={styles.legend} htmlFor="report-details">
            {REPORT_COPY.detailsLabel}
          </label>
          <textarea
            id="report-details"
            className={styles.details}
            value={details}
            maxLength={REPORT_DETAILS_MAX}
            rows={3}
            onChange={(e) => setDetails(e.target.value)}
          />
          {status === "error" && (
            <p role="alert" className={styles.error}>
              {REPORT_COPY.error}
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              {REPORT_COPY.cancel}
            </button>
            <button type="submit" className={styles.submit} disabled={!reason || sending}>
              {sending ? REPORT_COPY.sending : REPORT_COPY.submit}
            </button>
          </div>
        </form>
      )}
    </DisclaimerStyleModal>
  );
};

export default ReportDialog;

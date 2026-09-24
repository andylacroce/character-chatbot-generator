"use client";

import React, { useState } from "react";
import { logEvent } from "../../utils/logger";
import styles from "./styles/ConfirmDialog.module.css";

export interface ConfirmCopy {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  errorMessage: string;
}

interface ConfirmDialogProps {
  show: boolean;
  copy: ConfirmCopy;
  /** Runs on confirm; a rejection keeps the dialog open with `copy.errorMessage`. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Confirmation dialog for a destructive action (account deletion, clearing chats). */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ show, copy, onConfirm, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!show) return null;

  const handleCancel = () => {
    if (busy) return;
    setError("");
    onClose();
  };

  const handleConfirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      setBusy(false);
    } catch (err) {
      logEvent("error", "confirm_action_failed", "Confirmed destructive action failed", {
        action: copy.confirmLabel,
        error: err instanceof Error ? err.message : String(err),
      });
      setError(copy.errorMessage);
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={handleCancel}>
      <div
        className={styles.box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className={styles.title}>
          {copy.title}
        </h2>
        <p className={styles.text}>{copy.body}</p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={handleCancel}
            disabled={busy}
          >
            {copy.cancelLabel}
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

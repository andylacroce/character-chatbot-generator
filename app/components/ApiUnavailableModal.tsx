// =============================
// ApiUnavailableModal.tsx
// Modal component to display when the API is unavailable or rate-limited.
// Used for user feedback and error handling in ChatPage.
// =============================

import React from "react";
import styles from "../components/styles/ChatPage.module.css";

interface ApiUnavailableModalProps {
  show: boolean;
}

const ApiUnavailableModal: React.FC<ApiUnavailableModalProps> = ({ show }) => {
  if (!show) return null;
  return (
    <div className={styles.modalBackdrop} data-testid="modal-backdrop">
      <div className={styles.modalError} role="alert" data-testid="api-error-message">
        <span className={styles.apiErrorTitle}>
          Bot has vanished from the chat.
        </span>
        <span className={styles.apiErrorDesc}>
          The bot is temporarily unavailable or reloading. Please try again soon.
        </span>
      </div>
    </div>
  );
};

export default ApiUnavailableModal;

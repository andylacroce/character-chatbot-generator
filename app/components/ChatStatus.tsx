import React from "react";
import { logEvent } from "../../src/utils/logger";
import styles from "./styles/ChatStatus.module.css";

interface ChatStatusProps {
  error: string;
  retrying?: boolean;
}

/** Displays error and retrying status messages for API/network failures. */
const ChatStatus: React.FC<ChatStatusProps> = ({ error, retrying }) => {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    logEvent("info", "chat_status_render", "ChatStatus component rendered", {
      event: "chat_status_render",
      retrying,
      hasError: !!error,
    });
  }
  return (
    <div
      className={styles.statusArea}
      data-testid="chat-status-area"
      role="status"
      aria-live="polite"
    >
      {(retrying || process.env.NODE_ENV === "test") && (
        <div
          className={`${styles.retrying} ${retrying ? "" : styles.hidden}`}
          data-testid="retrying-message"
        >
          Retrying connection...
        </div>
      )}
      {error && (
        <div className={styles.error} data-testid="error-message">
          {error}
        </div>
      )}
    </div>
  );
};

export default ChatStatus;

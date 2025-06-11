/**
 * ChatStatus component
 *
 * Displays error and retrying status messages in the chat UI.
 * Used for user feedback on API/network errors and retry attempts.
 *
 * @param {ChatStatusProps} props - The component props
 * @returns {JSX.Element} The rendered status area
 */

import React from "react";

interface ChatStatusProps {
  error: string;
  retrying?: boolean;
}

const ChatStatus: React.FC<ChatStatusProps> = ({ error, retrying }) => (
  <div
    className="chat-status-area"
    data-testid="chat-status-area"
    role="status"
    aria-live="polite"
  >
    {retrying && !error && (
      <div className="alert alert-info" data-testid="retrying-message">
        Retrying connection...
      </div>
    )}
    {error && (
      <div className="alert alert-danger" data-testid="error-message">
        {error}
      </div>
    )}
  </div>
);

export default ChatStatus;

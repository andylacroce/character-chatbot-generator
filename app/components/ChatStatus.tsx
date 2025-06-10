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

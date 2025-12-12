import React from "react";
import styles from "./styles/ChatInput.module.css";

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  loading: boolean;
  apiAvailable: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  audioEnabled: boolean;
  onAudioToggle: () => void;
  onStopAudio: () => void;
  isAudioPlaying: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  onKeyDown,
  loading,
  apiAvailable,
  inputRef,
  audioEnabled,
  onAudioToggle,
  onStopAudio,
  isAudioPlaying,
}) => {
  const handleAudioToggle = () => {
    onAudioToggle();
  };

  return (
    <div className={styles.chatInputArea} data-testid="chat-input-area">
      <div className={styles.chatInputContainer} data-testid="chat-input-container" role="group" aria-label="Chat input area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          className={styles.chatInput}
          placeholder={!apiAvailable || loading ? "" : "Type in your message here..."}
          ref={inputRef}
          disabled={loading || !apiAvailable}
          autoFocus
          data-testid="chat-input"
          aria-label="Type your message"
          aria-disabled={loading || !apiAvailable}
        />
        <button
          onClick={onSend}
          className={
            loading || !apiAvailable
              ? `${styles.chatSendButton} ${styles.disabled}`
              : styles.chatSendButton
          }
          disabled={loading || !apiAvailable}
          data-testid="chat-send-button"
          aria-label={loading || !apiAvailable ? "Send disabled" : "Send message"}
        >
          {loading || !apiAvailable ? "HOLD" : "Send"}
        </button>
        {isAudioPlaying && (
          <button
            type="button"
            onClick={onStopAudio}
            className={styles.stopButton}
            aria-label="Stop playback"
            data-testid="chat-audio-stop"
          >
            <span className={styles.stopIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2" />
                <rect x="8" y="8" width="8" height="8" rx="1.5" fill="currentColor" />
              </svg>
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={handleAudioToggle}
          className={styles.audioToggleButton}
          aria-label={audioEnabled ? "Mute audio replies" : "Unmute audio replies"}
          aria-pressed={audioEnabled}
          data-testid="chat-audio-toggle"
          tabIndex={0}
        >
          {audioEnabled ? (
            // Modern outlined volume up icon
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 9v6h4l5 5V4l-5 5H5z" stroke="var(--button-bg)" strokeWidth="2" strokeLinejoin="round" fill="none"/>
              <path d="M16.5 8.5a5 5 0 010 7" stroke="var(--button-bg)" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <path d="M19 5a9 9 0 010 14" stroke="var(--button-bg)" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
          ) : (
            // Modern outlined volume off icon
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 9v6h4l5 5V4l-5 5H5z" stroke="var(--disabled-bg)" strokeWidth="2" strokeLinejoin="round" fill="none"/>
              <line x1="21" y1="3" x2="3" y2="21" stroke="var(--disabled-bg)" strokeWidth="2"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default ChatInput;

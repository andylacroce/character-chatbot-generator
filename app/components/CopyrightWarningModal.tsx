"use client";

/**
 * Copyright Warning Modal Component
 * 
 * Displays a warning lightbox when a user attempts to create a character
 * that may be protected by copyright or trademark.
 */

import React, { useEffect } from "react";
import styles from "./styles/BotCreator.module.css";
import type { CharacterValidationResult } from "../../pages/api/validate-character";

interface CopyrightWarningModalProps {
  validation: CharacterValidationResult;
  onContinue: () => void;
  onCancel: () => void;
  onSelectSuggestion?: (suggestion: string) => void;
}

export const CopyrightWarningModal: React.FC<CopyrightWarningModalProps> = ({
  validation,
  onContinue,
  onCancel,
  onSelectSuggestion
}) => {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion);
    }
    onCancel();
  };

  const isWarning = validation.warningLevel === "warning";

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.iconWrapper}>
          <span className={isWarning ? styles.warningIcon : styles.cautionIcon}>
            {isWarning ? '⚠️' : '⚡'}
          </span>
        </div>

        <h2 className={styles.title}>
          {isWarning ? 'Copyright/Trademark Warning' : 'Character Notice'}
          <span className={styles.characterName}>"{validation.characterName}"</span>
        </h2>

        {validation.reason && (
          <div className={styles.reason}>
            {validation.reason}
          </div>
        )}

        {validation.suggestions && validation.suggestions.length > 0 && (
          <div className={styles.suggestions}>
            <div className={styles.suggestionsTitle}>
              Suggested alternatives (click to use):
            </div>
            <ul className={styles.suggestionsList}>
              {validation.suggestions.map((suggestion, idx) => (
                <li
                  key={idx}
                  className={styles.suggestionItem}
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.buttonGroup}>
          <button
            className={`${styles.button} ${styles.cancelButton}`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`${styles.button} ${styles.continueButton}`}
            onClick={onContinue}
          >
            Continue Anyway
          </button>
        </div>

        <p className={styles.modalDisclaimer}>
          By continuing, you acknowledge potential copyright or trademark concerns.
          Use of protected characters may have legal implications.
        </p>
      </div>
    </div>
  );
};

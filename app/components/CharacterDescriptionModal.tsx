"use client";

/**
 * Character Description Modal Component
 *
 * Shown when /api/validate-character reports `recognized: false` — the entered name
 * doesn't match any character or person Claude actually knows about. Rather than let
 * Claude improvise a generic personality from just the name, this collects a
 * description (and optionally an appearance) from the user to build the character
 * from instead.
 */

import React, { useEffect, useState } from "react";
import styles from "./styles/BotCreator.module.css";

interface CharacterDescriptionModalProps {
  characterName: string;
  onSubmit: (description: string, appearance: string) => void;
  onCancel: () => void;
}

const MAX_LENGTH = 500;

export const CharacterDescriptionModal: React.FC<CharacterDescriptionModalProps> = ({
  characterName,
  onSubmit,
  onCancel
}) => {
  const [description, setDescription] = useState("");
  const [appearance, setAppearance] = useState("");

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

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

  const trimmedDescription = description.trim();

  const handleSubmit = () => {
    if (!trimmedDescription) return;
    onSubmit(trimmedDescription, appearance.trim());
  };

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.iconWrapper}>
          <span className={styles.cautionIcon}>✎</span>
        </div>

        <h2 className={styles.title}>
          Tell us about
          <span className={styles.characterName}>&quot;{characterName}&quot;</span>
        </h2>

        <div className={styles.reason}>
          We don&apos;t recognize this as an existing character, so we can&apos;t build a
          personality from the name alone. Describe who they are — personality, background,
          how they talk — and we&apos;ll bring them to life from that instead.
        </div>

        <label htmlFor="character-description" className={styles.suggestionsTitle}>
          Personality &amp; background
        </label>
        <textarea
          id="character-description"
          className={styles.descriptionTextarea}
          placeholder="e.g. A grumpy retired dragon-slayer who now runs a bakery and complains about everything, but secretly loves helping new adventurers."
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_LENGTH))}
          maxLength={MAX_LENGTH}
          rows={4}
          data-testid="description-textarea"
          autoFocus
        />
        <div className={styles.charCount}>{description.length}/{MAX_LENGTH}</div>

        <label htmlFor="character-appearance" className={styles.suggestionsTitle}>
          Appearance <span aria-hidden="true">(optional)</span>
        </label>
        <textarea
          id="character-appearance"
          className={styles.descriptionTextarea}
          placeholder="e.g. Stocky, silver-bearded, flour-dusted apron over old battle scars."
          value={appearance}
          onChange={(e) => setAppearance(e.target.value.slice(0, MAX_LENGTH))}
          maxLength={MAX_LENGTH}
          rows={3}
          data-testid="appearance-textarea"
        />
        <div className={styles.charCount}>{appearance.length}/{MAX_LENGTH}</div>

        <div className={styles.buttonGroup}>
          <button
            className={`${styles.button} ${styles.cancelButton}`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`${styles.button} ${styles.continueButton}`}
            onClick={handleSubmit}
            disabled={!trimmedDescription}
          >
            Create Character
          </button>
        </div>

        <p className={styles.modalDisclaimer}>
          Your description shapes this character&apos;s personality
          {appearance.trim() ? " and portrait" : ""}. It must not contain illegal,
          sexual, or hateful content — anything that does will be disregarded when
          generating the character.
        </p>
      </div>
    </div>
  );
};

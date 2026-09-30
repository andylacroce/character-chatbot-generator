"use client";

/**
 * The one shared lightbox for every "a character is being generated/loaded, please
 * wait" moment in the app — the guessing game's start-a-run and next-round generation
 * (GamePage.tsx's `starting`/`continuing`, driven by useGameController.ts's
 * fetchRoundWithProgress) and the landing page's own character-creation flow
 * (BotCreator.tsx's URL auto-launch, resume/new-chat interstitial, validation, and
 * personality/avatar/voice generation steps). Introduced so every "character loading"
 * moment shares one visual language instead of the game having a staged checklist
 * lightbox while character creation had a plain inline spinner — the two features do the
 * same underlying kind of wait (this app's Claude/image/TTS generation pipeline), so they
 * should look and feel the same to a user moving between them.
 *
 * Unlike this app's other small lightboxes (DisclaimerStyleModal), there's no close
 * button and no Escape-to-close: the wait itself isn't dismissible. An optional
 * `onCancel` (BotCreator's various "Cancel" actions; the game has none) renders a plain
 * cancel action instead, since cancelling here means abandoning the whole in-flight
 * request, not just closing a dialog.
 */

import React from "react";
import { FaCheckCircle } from "react-icons/fa";
import styles from "./styles/CharacterLoadingOverlay.module.css";

/** One row of the checklist below — a named generation step and its live status. */
export interface LoadingStage {
  stage: string;
  label: string;
  done: boolean;
  active: boolean;
}

interface CharacterLoadingOverlayProps {
  show: boolean;
  title: string;
  /**
   * The current step's own label, shown on its own when there's no `stages` checklist
   * to render (e.g. BotCreator's single-phase validating/interstitial states). Ignored
   * once `stages` is non-empty, since the checklist's own active row already shows it —
   * showing both would just repeat the same text twice.
   */
  message: string;
  /**
   * The full checklist in display order. An empty array means "no checklist", falling
   * back to a plain spinner + `message`.
   */
  stages: LoadingStage[];
  testId: string;
  onCancel?: () => void;
  cancelLabel?: string;
}

/** Shared "generating a character" lightbox — see module doc above. */
const CharacterLoadingOverlay: React.FC<CharacterLoadingOverlayProps> = ({
  show,
  title,
  message,
  stages,
  testId,
  onCancel,
  cancelLabel = "Cancel",
}) => {
  if (!show) return null;

  return (
    <div className={styles.backdrop} data-testid={testId}>
      <div className={styles.box} role="status" aria-live="polite">
        <h2 className={styles.title}>{title}</h2>
        {stages.length > 0 ? (
          <ul className={styles.stageList}>
            {stages.map((stage) => (
              <li
                key={stage.stage}
                className={
                  stage.done
                    ? styles.stageDone
                    : stage.active
                      ? styles.stageActive
                      : styles.stagePending
                }
              >
                {stage.done ? (
                  <FaCheckCircle className={styles.stageIconDone} aria-hidden="true" />
                ) : stage.active ? (
                  <span className={styles.stageSpinner} aria-hidden="true" />
                ) : (
                  <span className={styles.stageDot} aria-hidden="true" />
                )}
                <span>{stage.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.fallback}>
            <span className={styles.stageSpinner} aria-hidden="true" />
            <p className={styles.message}>{message}</p>
          </div>
        )}
        {onCancel && (
          <button
            type="button"
            className={styles.cancelButton}
            aria-label={cancelLabel}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default CharacterLoadingOverlay;

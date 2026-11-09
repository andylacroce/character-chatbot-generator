import type { LoadingStage } from "./CharacterLoadingOverlay";

/** The ordered steps of creating a character, keyed by `useBotCreation`'s `progress` value. */
export const progressSteps = [
  {
    key: "personality",
    label: "Creating personality",
  },
  {
    key: "avatar",
    label: "Generating portrait",
  },
  {
    key: "voice",
    label: "Selecting voice",
  },
];

/**
 * Builds CharacterLoadingOverlay's checklist — the same shared lightbox the guessing
 * game uses for its own round generation (see CharacterLoadingOverlay.tsx's doc
 * comment). The active row's label prefers `loadingMessage` over the step's own static
 * label so a mid-step fallback (e.g. "Using default image"/"Using default voice") still
 * shows.
 */
export function buildProgressStages(
  progress: string | null,
  loadingMessage: string | null,
): LoadingStage[] {
  const activeStepIndex = progressSteps.findIndex((s) => s.key === progress);
  return progressSteps.map((step, index) => ({
    stage: step.key,
    label: index === activeStepIndex && loadingMessage ? loadingMessage : `${step.label}…`,
    done: activeStepIndex >= 0 && index < activeStepIndex,
    active: index === activeStepIndex,
  }));
}

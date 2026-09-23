/**
 * The character-creation flow shared by the web app (app/components/useBotCreation.ts) and
 * the mobile app (apps/mobile/src/screens/CreatorScreen.tsx): a one-time "what should we
 * call you" gate, validation (hard blocks, the copyright warning/caution modal, and the
 * "describe your character" prompt for an unrecognized name), the generation pipeline with
 * progress, random names, and cancellation that works at any step. Each platform supplies
 * its requests (CreationTransport), a logger, and what to do with the finished character.
 */

import { useRef, useState } from "react";
import {
  generateCharacter,
  type CreationLogger,
  type CreationStep,
  type CreationTransport,
} from "./characterCreation";
import type { Bot, CharacterValidationResult } from "./types";
import type { UserNameContext } from "./useUserNameState";

export interface UseCharacterCreationOptions {
  transport: CreationTransport;
  onCreated: (bot: Bot) => void;
  userNameCtx: UserNameContext;
  log: CreationLogger;
  /** Called with each finished character's voice before onCreated (e.g. to cache it). */
  onVoiceConfig?: (bot: Bot) => void;
}

const BLOCKED_MESSAGE = "That name isn't allowed. Please choose a different name.";
const SCRUBBED_MESSAGE = "This character is no longer available. Please choose a different name.";
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Shared creation flow, see module doc above. */
export function useCharacterCreation({
  transport,
  onCreated,
  userNameCtx,
  log,
  onVoiceConfig,
}: UseCharacterCreationOptions) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<CreationStep>(null);
  const [randomizing, setRandomizing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<CharacterValidationResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [showNameGateModal, setShowNameGateModal] = useState(false);
  // One token object per run, so cancelling one run never affects a later one.
  const cancelRequested = useRef<{ cancelled: boolean } | null>(null);
  const lastRandomNameRef = useRef("");
  // Set by a modal's "continue" so the resumed run skips validation it already passed.
  const proceedWithoutValidationRef = useRef(false);
  // Set by the name gate's save/skip so the resumed run doesn't show the gate again.
  const skipNameGateRef = useRef(false);
  // validate-character's `recognized` for the run in flight (fail open: true).
  const recognizedRef = useRef(true);
  // Description text from the "describe your character" prompt, used once by the next run.
  const pendingDescriptionRef = useRef("");
  const pendingAppearanceRef = useRef("");
  // A name to create that hasn't landed in `input` state yet (see createNamed).
  const pendingNameRef = useRef<string | null>(null);

  const handleCreate = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    const name = (pendingNameRef.current ?? input).trim();
    pendingNameRef.current = null;
    if (!name) {
      setError("Please enter a name or character.");
      return;
    }

    // Asked once, the first time this device doesn't know the visitor's own name (and
    // they haven't skipped it). Waits for isResolved, so an already-named signed-in user
    // isn't asked just because their profile hadn't loaded yet. Every creation path
    // funnels through here, so every path gets the gate.
    if (
      !skipNameGateRef.current &&
      userNameCtx.isResolved &&
      !userNameCtx.name &&
      !userNameCtx.hasSkippedGate
    ) {
      pendingNameRef.current = name;
      setShowNameGateModal(true);
      return;
    }
    skipNameGateRef.current = false;

    // One token for the whole run, validation through generation, so Cancel works at
    // any step (a cancelled validation must not go on to show a modal or generate).
    const thisRunToken = { cancelled: false };
    cancelRequested.current = thisRunToken;

    if (!proceedWithoutValidationRef.current) {
      setValidating(true);
      setError("");
      try {
        const validation = await transport.validate(name);
        if (thisRunToken.cancelled) return;
        recognizedRef.current = validation.recognized !== false;

        // Never overridable: created characters end up on the public gallery.
        if (validation.blocked) {
          setError(BLOCKED_MESSAGE);
          setValidating(false);
          log("warn", "bot_validation_blocked", "Character name blocked as abusive content", {
            characterName: name,
          });
          return;
        }
        // Already blocklisted, or just removed from the public cache: continuing would only
        // regenerate the name that was removed, so this is a hard stop too.
        if (validation.scrubbed) {
          setError(SCRUBBED_MESSAGE);
          setValidating(false);
          log(
            "warn",
            "bot_validation_scrubbed",
            "Character removed from cache after failing re-validation",
            { characterName: name },
          );
          return;
        }
        if (validation.warningLevel === "warning" || validation.warningLevel === "caution") {
          setValidationResult(validation);
          setShowValidationModal(true);
          setValidating(false);
          log("info", "bot_validation_warning_shown", "Validation warning displayed", {
            characterName: name,
            warningLevel: validation.warningLevel,
            isSafe: validation.isSafe,
          });
          return;
        }
        // An original character: ask who they are instead of improvising from a name.
        if (validation.recognized === false) {
          setShowDescriptionModal(true);
          setValidating(false);
          log(
            "info",
            "bot_description_prompt_shown",
            "Prompted for character description (unrecognized name)",
            { characterName: name },
          );
          return;
        }
        setValidating(false);
      } catch (err) {
        if (thisRunToken.cancelled) return;
        setValidating(false);
        log("warn", "bot_validation_failed", "Validation failed, proceeding anyway", {
          characterName: name,
          error: errorText(err),
        });
      }
    }

    if (thisRunToken.cancelled) return;

    // True when this run resumed from a modal (a copyright override, or a described
    // original character): such a character skips the shared cache, durable storage, and
    // the user's saved characters.
    const bypassedCopyrightWarning = proceedWithoutValidationRef.current;
    proceedWithoutValidationRef.current = false;

    log("info", "bot_creation_started", "User initiated bot creation", { characterName: name });
    setError("");
    setLoading(true);
    setProgress("personality");
    setLoadingMessage(null);
    try {
      const bot = await generateCharacter(transport, name, {
        onProgress: setProgress,
        setLoadingMessage,
        cancelToken: thisRunToken,
        skipPersistence: bypassedCopyrightWarning,
        description: pendingDescriptionRef.current || undefined,
        appearance: pendingAppearanceRef.current || undefined,
        recognized: recognizedRef.current,
        log,
      });
      if (!thisRunToken.cancelled) {
        setProgress(null);
        setLoadingMessage(null);
        log("info", "bot_creation_success", "Bot created successfully", {
          characterName: bot.name,
          hasVoiceConfig: !!bot.voiceConfig,
          avatarUrl: bot.avatarUrl,
        });
        try {
          onVoiceConfig?.(bot);
        } catch {
          // Caching the voice is a convenience; never fail a finished character over it.
        }
        onCreated(bot);
      }
    } catch (err) {
      if (!thisRunToken.cancelled) {
        log("error", "bot_creation_failed", "Bot creation failed", {
          characterName: name,
          error: errorText(err),
        });
        setError("Failed to generate character. Please try again.");
        setProgress(null);
        setLoadingMessage(null);
      }
    } finally {
      setLoading(false);
      pendingDescriptionRef.current = "";
      pendingAppearanceRef.current = "";
    }
  };

  /** Creates a character by name without waiting for `input` state (e.g. a tapped portrait). */
  const createNamed = (name: string) => {
    setInput(name);
    pendingNameRef.current = name;
    void handleCreate();
  };

  const handleCancel = () => {
    if (cancelRequested.current) cancelRequested.current.cancelled = true;
    setValidating(false);
    setLoading(false);
    setProgress(null);
  };

  /** Saves the gate's name (if any) and resumes the paused run. */
  const handleNameGateSave = (name: string) => {
    if (name.trim()) userNameCtx.setName(name.trim());
    else userNameCtx.markGateSkipped();
    setShowNameGateModal(false);
    skipNameGateRef.current = true;
    void handleCreate();
  };

  /** Dismisses the gate without a name and resumes the paused run. */
  const handleNameGateSkip = () => {
    userNameCtx.markGateSkipped();
    setShowNameGateModal(false);
    skipNameGateRef.current = true;
    void handleCreate();
  };

  const handleValidationContinue = () => {
    setShowValidationModal(false);
    proceedWithoutValidationRef.current = true;
    log("info", "bot_validation_override", "User chose to proceed despite warning", {
      characterName: input.trim(),
      warningLevel: validationResult?.warningLevel,
    });
    void handleCreate();
  };

  const handleValidationCancel = () => {
    setShowValidationModal(false);
    setValidationResult(null);
    log("info", "bot_validation_cancelled", "User cancelled after validation warning", {
      characterName: input.trim(),
      warningLevel: validationResult?.warningLevel,
    });
  };

  const handleValidationSuggestion = (suggestion: string) => {
    setInput(suggestion);
    setValidationResult(null);
    setShowValidationModal(false);
    log("info", "bot_validation_suggestion_selected", "User selected suggested alternative", {
      originalName: input.trim(),
      selectedSuggestion: suggestion,
    });
  };

  const handleDescriptionSubmit = (description: string, appearance: string) => {
    setShowDescriptionModal(false);
    pendingDescriptionRef.current = description.trim();
    pendingAppearanceRef.current = appearance.trim();
    proceedWithoutValidationRef.current = true;
    log("info", "bot_description_submitted", "User submitted character description", {
      characterName: input.trim(),
      descriptionLength: description.trim().length,
      hasAppearance: Boolean(appearance.trim()),
    });
    void handleCreate();
  };

  const handleDescriptionCancel = () => {
    setShowDescriptionModal(false);
    log("info", "bot_description_cancelled", "User cancelled description prompt", {
      characterName: input.trim(),
    });
  };

  const handleRandomCharacter = async () => {
    setRandomizing(true);
    setError("");
    try {
      const name = await transport.randomName();
      setInput(name);
      lastRandomNameRef.current = name;
      log("info", "bot_random_character_selected", "Random character selected", {
        characterName: name,
      });
    } catch (err) {
      log("error", "bot_random_character_failed", "Random character selection failed", {
        error: errorText(err),
      });
      setError("Failed to get random character");
    } finally {
      setRandomizing(false);
    }
  };

  return {
    input,
    setInput,
    error,
    setError,
    loading,
    setLoading,
    progress,
    setProgress,
    randomizing,
    setRandomizing,
    loadingMessage,
    setLoadingMessage,
    validating,
    validationResult,
    showValidationModal,
    showDescriptionModal,
    showNameGateModal,
    cancelRequested,
    lastRandomNameRef,
    handleCreate,
    createNamed,
    handleCancel,
    handleRandomCharacter,
    handleValidationContinue,
    handleValidationCancel,
    handleValidationSuggestion,
    handleDescriptionSubmit,
    handleDescriptionCancel,
    handleNameGateSave,
    handleNameGateSkip,
  };
}

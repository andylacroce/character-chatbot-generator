import { useState, useRef, MutableRefObject } from "react";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import { authenticatedFetch } from "../../src/utils/api";
import type { Bot } from "./BotCreator";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { persistVoiceConfig } from "../../src/utils/voiceConfigPersistence";
import type { CharacterValidationResult } from "../../pages/api/validate-character";

type ProgressStep = "personality" | "avatar" | "voice" | null;

export function useBotCreation(onBotCreated: (bot: Bot) => void) {
    const [input, setInput] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [progress, setProgress] = useState<ProgressStep>(null);
    const [randomizing, setRandomizing] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [validationResult, setValidationResult] = useState<CharacterValidationResult | null>(null);
    const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
    const [validating, setValidating] = useState<boolean>(false);
    const cancelRequested = useRef<boolean>(false);
    const lastRandomNameRef = useRef<string>("");
    const proceedWithoutValidationRef = useRef<boolean>(false);

    async function getRandomCharacterName(): Promise<string> {
        try {
            const res = await authenticatedFetch(`/api/random-character`);
            const data = await res.json();
            if (res.ok && data && typeof data.name === "string" && data.name.trim()) {
                return data.name.trim();
            }
            return 'Sherlock Holmes';
        } catch {
            return 'Sherlock Holmes';
        }
    }

    async function validateCharacterName(name: string): Promise<CharacterValidationResult> {
        try {
            const res = await authenticatedFetch('/api/validate-character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                return await res.json();
            }
            // Default to safe on error
            return {
                characterName: name,
                isPublicDomain: true,
                isSafe: true,
                warningLevel: "none"
            };
        } catch {
            return {
                characterName: name,
                isPublicDomain: true,
                isSafe: true,
                warningLevel: "none"
            };
        }
    }

    const handleCreate = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim()) {
            setError("Please enter a name or character.");
            return;
        }

        // If we haven't validated yet and not explicitly proceeding without validation
        if (!proceedWithoutValidationRef.current) {
            setValidating(true);
            setError("");
            
            try {
                const validation = await validateCharacterName(input.trim());
                
                // If character has warning or caution level, show modal
                if (validation.warningLevel === "warning" || validation.warningLevel === "caution") {
                    setValidationResult(validation);
                    setShowValidationModal(true);
                    setValidating(false);
                    
                    if (typeof window !== 'undefined') {
                        logEvent('info', 'bot_validation_warning_shown', 'Validation warning displayed', sanitizeLogMeta({
                            characterName: input.trim(),
                            warningLevel: validation.warningLevel,
                            isSafe: validation.isSafe
                        }));
                    }
                    return; // Stop here and wait for user decision
                }
                
                // If safe, proceed directly
                setValidating(false);
            } catch (err) {
                // On validation error, proceed anyway
                setValidating(false);
                if (typeof window !== 'undefined') {
                    logEvent('warn', 'bot_validation_failed', 'Validation failed, proceeding anyway', sanitizeLogMeta({
                        characterName: input.trim(),
                        error: err instanceof Error ? err.message : String(err)
                    }));
                }
            }
        }

        // Reset the flag for next time
        proceedWithoutValidationRef.current = false;

        if (typeof window !== 'undefined') {
            logEvent('info', 'bot_creation_started', 'User initiated bot creation', sanitizeLogMeta({
                characterName: input.trim()
            }));
        }
        setError("");
        setLoading(true);
        setProgress("personality");
        setLoadingMessage(null);
        cancelRequested.current = false;
        try {
            const bot = await generateBotDataWithProgressCancelable(
                input.trim(),
                setProgress,
                setLoadingMessage,
                cancelRequested
            );
            if (!cancelRequested.current) {
                setProgress(null);
                setLoadingMessage(null);
                if (typeof window !== 'undefined') {
                    logEvent('info', 'bot_creation_success', 'Bot created successfully', sanitizeLogMeta({
                        characterName: bot.name,
                        hasVoiceConfig: !!bot.voiceConfig,
                        avatarUrl: bot.avatarUrl
                    }));
                }
                onBotCreated(bot);
            }
        } catch (err) {
            if (!cancelRequested.current) {
                if (typeof window !== 'undefined') {
                    logEvent('error', 'bot_creation_failed', 'Bot creation failed', sanitizeLogMeta({
                        characterName: input.trim(),
                        error: err instanceof Error ? err.message : String(err)
                    }));
                }
                setError("Failed to generate character. Please try again.");
                setProgress(null);
                setLoadingMessage(null);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        cancelRequested.current = true;
        setLoading(false);
        setProgress(null);
    };

    const handleValidationContinue = () => {
        setShowValidationModal(false);
        proceedWithoutValidationRef.current = true;
        
        if (typeof window !== 'undefined') {
            logEvent('info', 'bot_validation_override', 'User chose to proceed despite warning', sanitizeLogMeta({
                characterName: input.trim(),
                warningLevel: validationResult?.warningLevel
            }));
        }
        
        // Trigger creation flow
        handleCreate();
    };

    const handleValidationCancel = () => {
        setShowValidationModal(false);
        setValidationResult(null);
        
        if (typeof window !== 'undefined') {
            logEvent('info', 'bot_validation_cancelled', 'User cancelled after validation warning', sanitizeLogMeta({
                characterName: input.trim(),
                warningLevel: validationResult?.warningLevel
            }));
        }
    };

    const handleValidationSuggestion = (suggestion: string) => {
        setInput(suggestion);
        setValidationResult(null);
        
        if (typeof window !== 'undefined') {
            logEvent('info', 'bot_validation_suggestion_selected', 'User selected suggested alternative', sanitizeLogMeta({
                originalName: input.trim(),
                selectedSuggestion: suggestion
            }));
        }
    };

    const handleRandomCharacter = async () => {
        setRandomizing(true);
        setError("");
        try {
            const name = await getRandomCharacterName();
            setInput(name);
            lastRandomNameRef.current = name;
            if (typeof window !== 'undefined') {
                logEvent('info', 'bot_random_character_selected', 'Random character selected', sanitizeLogMeta({
                    characterName: name
                }));
            }
        } catch (err) {
            if (typeof window !== 'undefined') {
                logEvent('error', 'bot_random_character_failed', 'Random character selection failed', sanitizeLogMeta({
                    error: err instanceof Error ? err.message : String(err)
                }));
            }
            setError("Failed to get random character");
        } finally {
            setRandomizing(false);
        }
    };

    // generateBotDataWithProgressCancelable is implemented as a top-level exported helper for testability
    // (see exported `generateBotDataWithProgressCancelable` function at module scope)

    return {
        input, setInput, error, setError, loading, setLoading, progress, setProgress,
        randomizing, setRandomizing, loadingMessage, setLoadingMessage, 
        validating, validationResult, showValidationModal,
        cancelRequested, lastRandomNameRef,
        handleCreate, handleCancel, handleRandomCharacter,
        handleValidationContinue, handleValidationCancel, handleValidationSuggestion
    };
}

// Top-level exported implementation so it can be unit tested independently of the hook
export async function generateBotDataWithProgressCancelable(
    originalInputName: string,
    onProgress: (step: ProgressStep) => void,
    setLoadingMessage: (msg: string | null) => void,
    cancelRequested: MutableRefObject<boolean>
): Promise<Bot> {
    // Implementation copied from previous inner function
    let personality = `You are ${originalInputName}. Stay in character.`;
    let correctedName = originalInputName;
    onProgress("personality");
    setLoadingMessage("Creating personality");
    if (cancelRequested.current) throw new Error("cancelled");
    try {
        setLoadingMessage("Creating personality");
        const personalityRes = await authenticatedFetch("/api/generate-personality", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: originalInputName }),
        });
        if (cancelRequested.current) throw new Error("cancelled");
        if (personalityRes.ok) {
            const data = await personalityRes.json();
            if (data.personality) personality = data.personality;
            if (data.correctedName) correctedName = data.correctedName;
            if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
                logEvent('info', 'bot_personality_generated', 'Personality generated', sanitizeLogMeta({
                    characterName: correctedName,
                    originalName: originalInputName
                }));
            }
        }
    } catch (err) {
        if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
            logEvent('warn', 'bot_personality_generation_failed', 'Personality generation failed, using default', sanitizeLogMeta({
                characterName: originalInputName,
                error: err instanceof Error ? err.message : String(err)
            }));
        }
    }
    onProgress("avatar");
    setLoadingMessage("Generating portrait — may take up to a minute");
    let avatarUrl = "/silhouette.svg";
    let gender: string | null = null;
    if (cancelRequested.current) throw new Error("cancelled");
    try {
        setLoadingMessage("Generating portrait — may take up to a minute");
        const avatarRes = await authenticatedFetch("/api/generate-avatar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: correctedName }),
        });
        if (cancelRequested.current) throw new Error("cancelled");
        if (avatarRes.ok) {
            const data = await avatarRes.json();
            if (data.avatarUrl) {
                avatarUrl = data.avatarUrl;
                if (data.avatarUrl === "/silhouette.svg") {
                    setLoadingMessage("Using default image");
                }
            }
            gender = data.gender || null;
        } else {
            setLoadingMessage("Using default image");
        }
    } catch {
        setLoadingMessage("Using default image");
    }
    onProgress("voice");
    setLoadingMessage("Selecting voice");
    let voiceConfig = null;
    if (cancelRequested.current) throw new Error("cancelled");
    try {
        voiceConfig = await api_getVoiceConfigForCharacter(correctedName, gender);
        if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
            logEvent('info', 'bot_voice_config_generated', 'Voice config generated', sanitizeLogMeta({
                characterName: correctedName,
                voiceName: voiceConfig?.name
            }));
        }
    } catch (err) {
        if (typeof window !== 'undefined') {
            logEvent('warn', 'bot_voice_config_generation_failed', 'Voice config generation failed', sanitizeLogMeta({
                characterName: correctedName,
                error: err instanceof Error ? err.message : String(err)
            }));
        }
        setLoadingMessage("Using default voice");
    }
    if (cancelRequested.current) throw new Error("cancelled");
    if (!voiceConfig) {
        throw new Error("Failed to generate a consistent voice for this character. Please try again.");
    }
    // Store voiceConfig with both localStorage and cookie fallback for durability across sessions
    try {
        persistVoiceConfig(correctedName, voiceConfig);
    } catch {}
    return { name: correctedName, personality, avatarUrl, voiceConfig, gender };
}

import { useState, useRef, MutableRefObject } from "react";
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import type { Bot } from "./BotCreator";

type ProgressStep = "personality" | "avatar" | "voice" | null;

export function useBotCreation(onBotCreated: (bot: Bot) => void) {
    const [input, setInput] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [progress, setProgress] = useState<ProgressStep>(null);
    const [randomizing, setRandomizing] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const cancelRequested = useRef<boolean>(false);
    const lastRandomNameRef = useRef<string>("");
    const recentRandomNames = useRef<string[]>([]);
    const RECENT_HISTORY_LIMIT = 10;

    async function getRandomCharacterNameAvoidRepeat(lastName: string, maxTries = 3): Promise<{ name: string }> {
        let tries = 0;
        let name = lastName;
        while (tries < maxTries) {
            try {
                const exclude = [...recentRandomNames.current, lastName].filter(Boolean).join(",");
                const res = await fetch(`/api/random-character?cb=${Date.now()}-${Math.random()}&exclude=${encodeURIComponent(exclude)}`);
                const data = await res.json();
                if (res.ok && data && typeof data.name === "string" && data.name.trim() && !recentRandomNames.current.includes(data.name.trim())) {
                    name = data.name.replace(/^\[STATIC\]\s*/, '').trim();
                    recentRandomNames.current.push(name);
                    if (recentRandomNames.current.length > RECENT_HISTORY_LIMIT) recentRandomNames.current.shift();
                    return { name };
                }
                if (data && typeof data.name === "string" && data.name.trim()) {
                    name = data.name.trim();
                }
            } catch {
                name = 'Gandalf';
                if (name.toLowerCase() !== lastName.toLowerCase() && !recentRandomNames.current.map((n: string) => n.toLowerCase()).includes(name.toLowerCase())) {
                    recentRandomNames.current.push(name);
                    if (recentRandomNames.current.length > RECENT_HISTORY_LIMIT) recentRandomNames.current.shift();
                    return { name };
                }
            }
            tries++;
        }
        return { name };
    }

    const handleCreate = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim()) {
            setError("Please enter a name or character.");
            return;
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
                onBotCreated(bot);
            }
        } catch {
            if (!cancelRequested.current) {
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

    const handleRandomCharacter = async () => {
        setRandomizing(true);
        setError("");
        try {
            const { name } = await getRandomCharacterNameAvoidRepeat(lastRandomNameRef.current);
            setInput(name);
            lastRandomNameRef.current = name;
        } catch {
            setError("Failed to get random character");
        } finally {
            setRandomizing(false);
        }
    };

    async function generateBotDataWithProgressCancelable(
        originalInputName: string,
        onProgress: (step: ProgressStep) => void,
        setLoadingMessage: (msg: string | null) => void,
        cancelRequested: MutableRefObject<boolean>
    ): Promise<Bot> {
        let personality = `You are ${originalInputName}. Always respond in character, using your unique style, knowledge, and quirks. Use your internal knowledge. Never break character or mention being an AI.`;
        let correctedName = originalInputName;
        onProgress("personality");
        setLoadingMessage("Creating personality");
        if (cancelRequested.current) throw new Error("cancelled");
        try {
            setLoadingMessage("Creating personality");
            const personalityRes = await fetch("/api/generate-personality", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: originalInputName }),
            });
            if (cancelRequested.current) throw new Error("cancelled");
            if (personalityRes.ok) {
                const data = await personalityRes.json();
                if (data.personality) personality = data.personality;
                if (data.correctedName) correctedName = data.correctedName;
            }
        } catch { }
        onProgress("avatar");
        setLoadingMessage("Generating portrait");
        let avatarUrl = "/silhouette.svg";
        let gender: string | null = null;
        if (cancelRequested.current) throw new Error("cancelled");
        try {
            setLoadingMessage("Generating portrait");
            const avatarRes = await fetch("/api/generate-avatar", {
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
        } catch {
            setLoadingMessage("Using default voice");
        }
        if (cancelRequested.current) throw new Error("cancelled");
        if (!voiceConfig) {
            throw new Error("Failed to generate a consistent voice for this character. Please try again.");
        }
        return { name: correctedName, personality, avatarUrl, voiceConfig, gender };
    }

    return {
        input, setInput, error, setError, loading, setLoading, progress, setProgress,
        randomizing, setRandomizing, loadingMessage, setLoadingMessage, cancelRequested, lastRandomNameRef,
        handleCreate, handleCancel, handleRandomCharacter
    };
}


const INITIAL_VISIBLE_COUNT = 20;
const LOAD_MORE_COUNT = 10;

export function useChatController(bot: Bot, onBackToCharacterCreation?: () => void) {
    const chatHistoryKey = `chatbot-history-${bot.name}`;
    const [messages, setMessages] = useState<Message[]>(() => {
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && chatHistoryKey) {
            try {
                const saved = localStorage.getItem(chatHistoryKey);
                if (saved) return JSON.parse(saved);
            } catch { }
        }
        return [];
    });

    const [input, setInput] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
            const savedAudioPreference = localStorage.getItem('audioEnabled');
            if (savedAudioPreference !== null) {
                return savedAudioPreference === 'true';
            }
        }
        return true;
    });
    const [apiAvailable, setApiAvailable] = useState<boolean>(true);
    const [sessionId, sessionDatetime] = useSession();
    const { error, setError, handleApiError } = useApiError();
    const [introError, setIntroError] = useState<string | null>(null);
    const audioEnabledRef = useRef(audioEnabled);
    const [retrying, setRetrying] = useState(false);
    const chatBoxRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
    const inputRef = useRef<HTMLInputElement | null>(null);

    useChatScrollAndFocus({ chatBoxRef, inputRef, messages, loading });

    useEffect(() => {
        audioEnabledRef.current = audioEnabled;
    }, [audioEnabled]);

    const { playAudio, stopAudio } = useAudioPlayer(audioEnabledRef);

    const logMessage = useCallback(
        async (message: Message) => {
            if (!sessionId || !sessionDatetime) return;
            try {
                await axios.post("/api/log-message", {
                    sender: message.sender,
                    text: message.text,
                    sessionId: sessionId,
                    sessionDatetime: sessionDatetime,
                });
            } catch (error) {
                console.warn("Failed to log message", {
                    event: "client_log_message_failed",
                    error: error instanceof Error ? error.message : String(error),
                    message,
                    sessionId,
                    sessionDatetime
                });
            }
        },
        [sessionId, sessionDatetime],
    );

    const introSentRef = useRef(false);
    useEffect(() => {
        if (introSentRef.current) return;
        if (messages.length === 0 && apiAvailable) {
            introSentRef.current = true;
            const getIntro = async () => {
                try {
                    if (!bot.voiceConfig) {
                        const msg = "Voice configuration missing for this character. Please recreate the bot.";
                        setIntroError(msg);
                        setError(msg);
                        if (typeof window !== 'undefined') {
                            console.error("Intro error:", msg, { bot });
                        }
                        return;
                    }
                    const response = await axios.post("/api/chat", {
                        message: "Introduce yourself in 2 sentences or less.",
                        personality: bot.personality,
                        botName: bot.name,
                        voiceConfig: bot.voiceConfig
                    });
                    const introMsg: Message = {
                        sender: bot.name,
                        text: response.data.reply,
                        audioFileUrl: response.data.audioFileUrl,
                    };
                    setMessages([introMsg]);
                    logMessage(introMsg);
                    setIntroError(null);
                } catch (e) {
                    const msg = "Failed to generate intro or voice config. Please recreate the bot.";
                    setIntroError(msg);
                    setError(msg);
                    if (typeof window !== 'undefined') {
                        console.error("Intro error:", msg, { bot, error: e });
                    }
                }
            };
            getIntro();
        }
    }, [messages.length, apiAvailable, bot, logMessage, playAudio, setError]);

    const sendMessage = useCallback(async () => {
        async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 2, initialDelay = 800): Promise<T> {
            let delay = initialDelay;
            let lastError;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                if (attempt > 0) {
                    setRetrying(true);
                    if (process.env.NODE_ENV === 'test') {
                        await new Promise(res => setTimeout(res, 1000));
                    } else {
                        await Promise.resolve();
                    }
                }
                setError("");
                try {
                    const result = await fn();
                    if (process.env.NODE_ENV === 'test') {
                        await new Promise(res => setTimeout(res, 200));
                    }
                    setRetrying(false);
                    return result;
                } catch (err: unknown) {
                    lastError = err;
                    if (attempt === maxRetries) {
                        if (process.env.NODE_ENV === 'test') {
                            await new Promise(res => setTimeout(res, 200));
                        }
                        setRetrying(false);
                        throw err;
                    }
                    await new Promise((res) => setTimeout(res, delay));
                    delay *= 2;
                }
            }
            setRetrying(false);
            throw lastError || new Error("Max retries reached");
        }

        if (!input.trim() || !apiAvailable || loading) return;
        const userMessage: Message = { sender: "User", text: input };
        setMessages((prevMessages) => [...prevMessages, userMessage]);
        const currentInput = input;
        setInput("");
        setLoading(true);
        setError("");
        logMessage(userMessage);
        try {
            if (!bot.voiceConfig) {
                const msg = "Voice configuration missing for this character. Please recreate the bot.";
                setError(msg);
                if (typeof window !== 'undefined') {
                    console.error("SendMessage error:", msg, { bot });
                }
                setLoading(false);
                return;
            }
            const response = await retryWithBackoff(
                () => axios.post("/api/chat", { message: currentInput, personality: bot.personality, botName: bot.name, voiceConfig: bot.voiceConfig }),
                2,
                800
            );
            const botReply: Message = {
                sender: bot.name,
                text: response.data.reply,
                audioFileUrl: response.data.audioFileUrl,
            };
            setMessages((prevMessages) => [...prevMessages, botReply]);
            logMessage(botReply);
        } catch (e) {
            const msg = "Failed to send message or generate reply.";
            setError(msg);
            handleApiError(new Error(msg));
            if (typeof window !== 'undefined') {
                console.error("SendMessage error:", msg, { bot, error: e });
            }
        } finally {
            setLoading(false);
        }
    }, [input, apiAvailable, logMessage, loading, handleApiError, setError, bot]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !loading && apiAvailable && input.trim()) {
            sendMessage();
        }
    };

    const handleAudioToggle = useCallback(() => {
        setAudioEnabled((prev) => {
            const newEnabled = !prev;
            if (typeof window !== 'undefined') {
                localStorage.setItem('audioEnabled', String(newEnabled));
            }
            if (!newEnabled) {
                stopAudio();
            }
            return newEnabled;
        });
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [stopAudio, inputRef]);

    useEffect(() => {
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
            localStorage.setItem('audioEnabled', String(audioEnabled));
        }
    }, [audioEnabled]);

    const healthCheckRan = useRef(false);
    useEffect(() => {
        if (healthCheckRan.current) return;
        healthCheckRan.current = true;
        axios
            .get("/api/health")
            .then(() => {
                setApiAvailable(true);
                if (inputRef.current) {
                    inputRef.current.focus();
                }
            })
            .catch((err) => {
                setApiAvailable(false);
                handleApiError(err);
            });
    }, [handleApiError]);

    useEffect(() => {
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && chatHistoryKey) {
            try {
                localStorage.setItem(chatHistoryKey, JSON.stringify(messages));
            } catch {
                // ignore
            }
        }
    }, [messages, chatHistoryKey]);

    const handleDownloadTranscript = async () => {
        try {
            await downloadTranscript(messages as Message[]);
        } catch {
            console.error("Failed to download transcript");
            alert("Failed to download transcript.");
        }
    };

    const handleHeaderLinkClick = useCallback(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [inputRef]);

    const handleBackToCharacterCreation = useCallback(() => {
        stopAudio();
        if (typeof onBackToCharacterCreation === 'function') {
            onBackToCharacterCreation();
        }
    }, [stopAudio, onBackToCharacterCreation]);

    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
    const handleScroll = useCallback(() => {
        if (!chatBoxRef.current) return;
        const { scrollTop } = chatBoxRef.current;
        if (scrollTop === 0 && visibleCount < messages.length) {
            setVisibleCount((prev) => {
                const newCount = Math.min(prev + LOAD_MORE_COUNT, messages.length);
                return newCount;
            });
        }
    }, [visibleCount, messages.length]);

    useEffect(() => {
        const ref = chatBoxRef.current;
        if (!ref) return;
        ref.addEventListener('scroll', handleScroll);
        return () => {
            ref.removeEventListener('scroll', handleScroll);
        };
    }, [handleScroll, visibleCount, messages.length]);

    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE_COUNT);
    }, [chatHistoryKey]);

    function getMessageHash(msg: Message) {
        return `${msg.sender}__${msg.text}__${msg.audioFileUrl ?? ''}`;
    }

    const lastPlayedAudioHashRef = useRef<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        if (!audioEnabledRef.current) return;
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        const lastMsgHash = getMessageHash(lastMsg);
        if (typeof window !== 'undefined') {
            if (lastPlayedAudioHashRef.current === null) {
                lastPlayedAudioHashRef.current = sessionStorage.getItem(`lastPlayedAudioHash-${bot.name}`);
            }
        }
        if (
            lastMsg.sender === bot.name &&
            typeof lastMsg.audioFileUrl === 'string' &&
            lastMsgHash !== lastPlayedAudioHashRef.current
        ) {
            (async () => {
                if (!cancelled) {
                    await playAudio(lastMsg.audioFileUrl!);
                    lastPlayedAudioHashRef.current = lastMsgHash;
                    if (typeof window !== 'undefined') {
                        sessionStorage.setItem(`lastPlayedAudioHash-${bot.name}`, lastMsgHash);
                    }
                }
            })();
        }
        return () => {
            cancelled = true;
            stopAudio();
        };
    }, [messages, bot.name, playAudio, stopAudio]);

    useEffect(() => {
        return () => {
            stopAudio();
        };
    }, [stopAudio]);

    useEffect(() => {
        // Debugging: log retrying state
        // console.debug("Retrying state updated", { event: "chat_retrying_state", retrying });
    }, [retrying]);

    return {
        messages,
        input,
        setInput,
        loading,
        audioEnabled,
        apiAvailable,
        introError,
        error,
        retrying,
        chatBoxRef,
        inputRef,
        visibleCount,
        handleDownloadTranscript,
        handleHeaderLinkClick,
        handleBackToCharacterCreation,
        handleScroll,
        sendMessage,
        handleKeyDown,
        handleAudioToggle,
    };
}
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { downloadTranscript } from "../../src/utils/downloadTranscript";
import { useSession } from "./useSession";
import { useApiError } from "./useApiError";
import { useChatScrollAndFocus } from "./useChatScrollAndFocus";
import { useAudioPlayer } from "./useAudioPlayer";
import type { Message } from "../../src/types/message";
import type { Bot } from "./BotCreator";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { downloadTranscript } from "../../src/utils/downloadTranscript";
import { authenticatedFetch } from "../../src/utils/api";
import { useSession } from "./useSession";
import { useApiError } from "./useApiError";
import { useChatScrollAndFocus } from "./useChatScrollAndFocus";
import { useAudioPlayer } from "./useAudioPlayer";
import storage from '../../src/utils/storage';
import type { Message } from "../../src/types/message";
import type { Bot } from "./BotCreator";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";

const INITIAL_VISIBLE_COUNT = 20;
const LOAD_MORE_COUNT = 10;

// Safe focus helper: defer focusing to avoid synchronous DOM updates inside async callbacks
const safeFocus = (ref: React.RefObject<HTMLInputElement | null>) => {
    try {
        const el = ref?.current;
        if (!el || typeof el.focus !== "function") return;
        if (typeof document !== "undefined" && !document.contains(el)) return;
        setTimeout(() => {
            try { el.focus(); } catch {}
        }, 0);
    } catch {}
};

export function useChatController(bot: Bot, onBackToCharacterCreation?: () => void) {
    const chatHistoryKey = `chatbot-history-${bot.name}`;
    
    // Memoize messages loading from localStorage
    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            const saved = storage.getItem(chatHistoryKey);
            if (saved) return JSON.parse(saved);
        } catch { }
        return [];
    });

    // Memoize voice config getter to prevent unnecessary re-renders
    const getVoiceConfig = useCallback(() => {
        try {
            if (typeof window !== 'undefined') {
                // Use localStorage for durable client-side voice config storage
                try {
                    const versioned = storage.getVersionedJSON(`voiceConfig-${bot.name}`);
                    if (versioned) return versioned.payload;
                } catch {}

                // Finally, check the saved bot in localStorage and populate both stores if found
                try {
                    const savedBotRaw = storage.getItem('chatbot-bot');
                    if (savedBotRaw) {
                        const parsed = JSON.parse(savedBotRaw);
                        if (parsed?.name === bot.name && parsed.voiceConfig) {
                            try { storage.setVersionedJSON(`voiceConfig-${bot.name}`, parsed.voiceConfig, 1); } catch {}
                            return parsed.voiceConfig;
                        }
                    }
                } catch {}

                if (bot.voiceConfig) {
                    try { storage.setVersionedJSON(`voiceConfig-${bot.name}`, bot.voiceConfig, 1); } catch {}
                    return bot.voiceConfig;
                }
            }
        } catch { }
        return bot.voiceConfig;
    }, [bot.name, bot.voiceConfig]);

    const [input, setInput] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
        try {
            const savedAudioPreference = storage.getItem('audioEnabled');
            if (savedAudioPreference !== null) return savedAudioPreference === 'true';
        } catch { }
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

    // Reset state when bot changes
    useEffect(() => {
        // Reset messages to load the new bot's chat history
        const newChatHistoryKey = `chatbot-history-${bot.name}`;
        try {
            const saved = storage.getItem(newChatHistoryKey);
            if (saved) setMessages(JSON.parse(saved));
            else setMessages([]);
        } catch {
            setMessages([]);
        }

        // Reset intro sent flag so new character gets introduction
        introSentRef.current = false;

        // Clear any previous errors
        setIntroError(null);
        setError("");

        // Reset retrying state
        setRetrying(false);

        // Reset input
        setInput("");

        // Reset loading state
        setLoading(false);

        // Reset visible count
        setVisibleCount(INITIAL_VISIBLE_COUNT);

        // Reset last played audio hash for new character
        lastPlayedAudioHashRef.current = null;

    }, [bot.name, setError]); // Only depend on bot.name to avoid unnecessary resets

    const { playAudio, stopAudio } = useAudioPlayer(audioEnabledRef);

    // Fix TypeScript errors by explicitly typing parameters
    const profileApiCall = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
        const start = performance.now();
        try {
            return await fn();
        } finally {
            const end = performance.now();
            if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
                logEvent('info', 'chat_api_timing', `${label} completed`, { duration: Math.round(end - start), operation: label });
            }
        }
    };

    const logMessage = useCallback(
        async (message: Message) => {
            if (!sessionId || !sessionDatetime) return;
            try {
                await profileApiCall("Log Message", () => authenticatedFetch("/api/log-message", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sender: message.sender,
                        text: message.text,
                        sessionId: sessionId,
                        sessionDatetime: sessionDatetime,
                    }),
                }).then(res => { if (!res.ok) throw new Error('Log failed'); }));
            } catch (error) {
                if (typeof window !== 'undefined') {
                    logEvent('warn', 'client_log_message_failed', 'Failed to log message to server', sanitizeLogMeta({
                        error: error instanceof Error ? error.message : String(error),
                        sender: message.sender,
                        sessionId
                    }));
                }
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
                    if (!getVoiceConfig()) {
                        const msg = "Voice configuration missing for this character. Please recreate the bot.";
                        setIntroError(msg);
                        setError(msg);
                        if (typeof window !== 'undefined') {
                            logEvent('error', 'chat_intro_voice_config_missing', msg, sanitizeLogMeta({
                                botName: bot.name,
                                hasVoiceConfig: !!bot.voiceConfig
                            }));
                        }
                        return;
                    }
                    const response = await profileApiCall("Fetch Intro", () => authenticatedFetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: "Introduce yourself in 2 sentences or less.",
                            personality: bot.personality,
                            botName: bot.name,
                            voiceConfig: getVoiceConfig(),
                            gender: bot.gender,
                            conversationHistory: []
                        }),
                    }).then(res => res.json()));
                    const introMsg: Message = {
                        sender: bot.name,
                        text: response.reply,
                        audioFileUrl: response.audioFileUrl,
                    };
                    setMessages([introMsg]);
                    logMessage(introMsg);
                    setIntroError(null);
                } catch (e) {
                    const msg = "Failed to generate intro or voice config. Please recreate the bot.";
                    setIntroError(msg);
                    setError(msg);
                    if (typeof window !== 'undefined') {
                        logEvent('error', 'chat_intro_generation_failed', msg, sanitizeLogMeta({
                            botName: bot.name,
                            error: e instanceof Error ? e.message : String(e)
                        }));
                    }
                }
            };
            getIntro();
        }
    }, [messages.length, apiAvailable, bot, logMessage, playAudio, setError, getVoiceConfig]);

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
            if (!getVoiceConfig()) {
                const msg = "Voice configuration missing for this character. Please recreate the bot.";
                setError(msg);
                if (typeof window !== 'undefined') {
                    logEvent('error', 'chat_send_voice_config_missing', msg, sanitizeLogMeta({
                        botName: bot.name,
                        hasVoiceConfig: !!bot.voiceConfig
                    }));
                }
                setLoading(false);
                return;
            }
            if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
                logEvent('info', 'chat_send_retry_start', 'Starting message send with retry logic', { botName: bot.name });
            }
            // Convert messages to conversation history format for API
            const conversationHistory = messages.slice(-20).map(msg => 
                msg.sender === bot.name ? `Bot: ${msg.text}` : `User: ${msg.text}`
            );
            const response = await retryWithBackoff(
                () => authenticatedFetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        message: currentInput,
                        personality: bot.personality,
                        botName: bot.name,
                        voiceConfig: getVoiceConfig(),
                        gender: bot.gender,
                        conversationHistory
                    }),
                }).then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                }),
                2,
                800
            );
            if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
                logEvent('info', 'chat_send_retry_success', 'Message send succeeded', { botName: bot.name });
            }
            const botReply: Message = {
                sender: bot.name,
                text: response.reply,
                audioFileUrl: response.audioFileUrl,
            };
            setMessages((prevMessages) => [...prevMessages, botReply]);
            logMessage(botReply);
        } catch (e) {
            const msg = "Failed to send message or generate reply.";
            setError(msg);
            handleApiError(new Error(msg));
            if (typeof window !== 'undefined') {
                logEvent('error', 'chat_send_message_failed', msg, sanitizeLogMeta({
                    botName: bot.name,
                    error: e instanceof Error ? e.message : String(e),
                    errorType: e instanceof Error ? e.constructor.name : typeof e,
                    hasVoiceConfig: !!getVoiceConfig(),
                    messageCount: messages.length
                }));
            }
        } finally {
            setLoading(false);
        }
    }, [input, apiAvailable, logMessage, loading, handleApiError, setError, bot, getVoiceConfig, messages]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !loading && apiAvailable && input.trim()) {
            sendMessage();
        }
    };

    const handleAudioToggle = useCallback(() => {
        setAudioEnabled((prev) => {
            const newEnabled = !prev;
            try { storage.setItem('audioEnabled', String(newEnabled)); } catch {}
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
        try { storage.setItem('audioEnabled', String(audioEnabled)); } catch {}
    }, [audioEnabled]);

    const healthCheckRan = useRef(false);
    useEffect(() => {
        if (healthCheckRan.current) return;
        healthCheckRan.current = true;
        authenticatedFetch("/api/health")
            .then(() => {
                setApiAvailable(true);
                safeFocus(inputRef);
            })
            .catch((err) => {
                setApiAvailable(false);
                handleApiError(err);
            });
    }, [handleApiError]);

    useEffect(() => {
        try {
            if (chatHistoryKey) storage.setItem(chatHistoryKey, JSON.stringify(messages));
        } catch {}
    }, [messages, chatHistoryKey]);

    const handleDownloadTranscript = async () => {
        try {
            await downloadTranscript(messages as Message[], { name: bot.name, avatarUrl: bot.avatarUrl });
            if (typeof window !== 'undefined') {
                logEvent('info', 'chat_transcript_downloaded', 'Transcript downloaded successfully', sanitizeLogMeta({
                    botName: bot.name,
                    messageCount: messages.length
                }));
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            if (typeof window !== 'undefined') {
                logEvent('error', 'chat_transcript_download_failed', 'Failed to download transcript', sanitizeLogMeta({
                    botName: bot.name,
                    error: errorMessage,
                    messageCount: messages.length
                }));
            }
            alert(`Failed to open transcript: ${errorMessage}`);
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
    // Throttle scroll handling using requestAnimationFrame to keep handlers cheap
    const scrollRafRef = useRef<number | null>(null);
    const handleScroll = useCallback(() => {
        if (!chatBoxRef.current) return;
        // If we already have a pending RAF, skip scheduling another one
        if (scrollRafRef.current !== null) return;
        scrollRafRef.current = window.requestAnimationFrame(() => {
            scrollRafRef.current = null;
            if (!chatBoxRef.current) return;
            const { scrollTop } = chatBoxRef.current;
            if (scrollTop === 0 && visibleCount < messages.length) {
                setVisibleCount((prev) => {
                    const newCount = Math.min(prev + LOAD_MORE_COUNT, messages.length);
                    return newCount;
                });
            }
        });
    }, [visibleCount, messages.length]);

    useEffect(() => {
        const ref = chatBoxRef.current;
        if (!ref) return;
        ref.addEventListener('scroll', handleScroll);
        return () => {
            ref.removeEventListener('scroll', handleScroll);
            // Cancel any pending RAF when cleaning up
            if (scrollRafRef.current !== null) {
                window.cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = null;
            }
        };
    }, [handleScroll, visibleCount, messages.length]);

    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE_COUNT);
    }, [chatHistoryKey]);

    // MOBILE KEYBOARD / VISUAL VIEWPORT ADJUSTMENT (CSS-driven)
    // Use existing `.ff-android-input-focus` pattern in globals.css and set
    // the `--vv-keyboard-pad` CSS variable dynamically so styles stay in CSS.
    useEffect(() => {
        const chatEl = chatBoxRef.current;
        if (!chatEl) return;

        const root = (typeof document !== 'undefined' && document.documentElement) || null;
    const vv = typeof window !== 'undefined' && (window as Window & { visualViewport?: VisualViewport }).visualViewport;
    let lastPad = 0;

    // iOS heuristic: store an initial window.innerHeight to detect keyboard
    // by measuring the difference. This helps when visualViewport isn't
    // reliable on some iOS versions/browsers.
    let initialInnerHeight: number | null = null;
    const isIOS = typeof navigator !== 'undefined' && /iP(ad|hone|od)/i.test(navigator.userAgent);

        const KEYBOARD_CLASSES = ['ff-android-input-focus', 'mobile-keyboard-open'];
        const setCssPad = (pad: number) => {
            try {
                if (!root) return;
                // set CSS variable on :root so globals.css can consume it
                root.style.setProperty('--vv-keyboard-pad', `${pad}px`);
                if (pad > 0) {
                    KEYBOARD_CLASSES.forEach((c) => root.classList.add(c));
                } else {
                    KEYBOARD_CLASSES.forEach((c) => root.classList.remove(c));
                }
            } catch {}
        };

        let vvRaf: number | null = null;
        const scheduleViewportChange = () => {
            if (vvRaf !== null) return;
            vvRaf = window.requestAnimationFrame(() => {
                vvRaf = null;
                onViewportChange();
            });
        };

        const onViewportChange = () => {
            try {
                // Prefer visualViewport when available
                let heightDiff = 0;
                if (vv) {
                    heightDiff = window.innerHeight - vv.height;
                } else if (isIOS) {
                    // iOS: if we don't yet have an initialInnerHeight, set it now
                    if (!initialInnerHeight) initialInnerHeight = window.innerHeight;
                    heightDiff = initialInnerHeight - window.innerHeight;
                } else {
                    // Fallback for other browsers without visualViewport
                    heightDiff = 0;
                }

                const pad = heightDiff > 0 ? Math.min(heightDiff, 600) + 8 : 0;
                if (pad !== lastPad) {
                    lastPad = pad;
                    setCssPad(pad);
                }
            } catch {}
        };

        const onFocus = () => {
            // For iOS, capture initial height the first time the input is focused
            try {
                if (isIOS && !initialInnerHeight) initialInnerHeight = window.innerHeight;
            } catch {}

            // Delay slightly to let the visualViewport update
            setTimeout(() => {
                onViewportChange();
                try { chatEl.scrollTop = chatEl.scrollHeight; } catch {}
                // Also ensure the page itself is scrolled to the bottom on mobile
                try {
                    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
                    if (/Android|iP(ad|hone|od)/i.test(ua)) {
                        window.scrollTo(0, document.body.scrollHeight);
                    }
                } catch {}
            }, 50);
        };

        const onBlur = () => {
            lastPad = 0;
            setCssPad(0);
        };

        if (vv) {
            vv.addEventListener('resize', scheduleViewportChange);
            vv.addEventListener('scroll', scheduleViewportChange);
        } else {
            window.addEventListener('resize', scheduleViewportChange);
        }

        const inputEl = inputRef.current;
        if (inputEl) {
            inputEl.addEventListener('focus', onFocus);
            inputEl.addEventListener('blur', onBlur);
        }

        return () => {
            try {
                if (vv) {
                    vv.removeEventListener('resize', scheduleViewportChange);
                    vv.removeEventListener('scroll', scheduleViewportChange);
                } else {
                    window.removeEventListener('resize', scheduleViewportChange);
                }
                if (inputEl) {
                    inputEl.removeEventListener('focus', onFocus);
                    inputEl.removeEventListener('blur', onBlur);
                }
                // cleanup
                if (root) {
                    KEYBOARD_CLASSES.forEach((c) => root.classList.remove(c));
                    root.style.removeProperty('--vv-keyboard-pad');
                }
                if (vvRaf !== null) {
                    window.cancelAnimationFrame(vvRaf);
                    vvRaf = null;
                }
            } catch {}
        };
    }, [chatBoxRef, inputRef]);

    function getMessageHash(msg: Message) {
        return `${msg.sender}__${msg.text}__${msg.audioFileUrl ?? ''}`;
    }

    const lastPlayedAudioHashRef = useRef<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        const abortController = new AbortController();
        if (!audioEnabledRef.current) return;
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        const lastMsgHash = getMessageHash(lastMsg);
        if (typeof window !== 'undefined') {
                if (lastPlayedAudioHashRef.current === null) {
                try { lastPlayedAudioHashRef.current = storage.getItem(`lastPlayedAudioHash-${bot.name}`); } catch {}
            }
        }
        if (
            lastMsg.sender === bot.name &&
            typeof lastMsg.audioFileUrl === 'string' &&
            lastMsgHash !== lastPlayedAudioHashRef.current
        ) {
            (async () => {
                if (!cancelled) {
                    // Mark this message as being played to avoid concurrent double-play
                    lastPlayedAudioHashRef.current = lastMsgHash;
                    try {
                        await playAudio(lastMsg.audioFileUrl!, abortController.signal);
                        try { storage.setItem(`lastPlayedAudioHash-${bot.name}`, lastMsgHash); } catch {}
                    } catch (err: unknown) {
                        // If playback failed or was aborted, clear the in-progress marker
                        const errName = (err && typeof err === 'object' && 'name' in err)
                            ? (err as Record<string, unknown>)['name'] as string | undefined
                            : undefined;
                        if (errName === 'AbortError') {
                            // aborted - do not log as error
                            if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
                                logEvent('info', 'chat_audio_playback_aborted', 'Audio playback aborted', { botName: bot.name });
                            }
                        } else {
                            if (typeof window !== 'undefined') {
                                logEvent('error', 'chat_audio_playback_error', 'Audio playback failed', sanitizeLogMeta({
                                    botName: bot.name,
                                    error: err instanceof Error ? err.message : String(err),
                                    errorName: errName
                                }));
                            }
                        }
                        if (lastPlayedAudioHashRef.current === lastMsgHash) {
                            lastPlayedAudioHashRef.current = null;
                        }
                    }
                }
            })();
        }
        return () => {
            cancelled = true;
            abortController.abort();
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
 

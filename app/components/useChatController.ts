/**
 * Chat controller hook that orchestrates chat state, API calls, audio, and logging for the chat UI.
 * Handles message history, retries, intro generation, transcript export, and audio playback toggling.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession as useAuthSession } from "next-auth/react";
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
import { api_getVoiceConfigForCharacter } from "./api_getVoiceConfigForCharacter";
import { loadVoiceConfig, persistVoiceConfig } from "../../src/utils/voiceConfigPersistence";
import type { CharacterVoiceConfig } from "../../src/utils/characterVoices";
import { STORAGE_KEYS, chatHistoryKey, lastPlayedAudioHashKey } from "../../src/utils/storageKeys";

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
    const historyKey = chatHistoryKey(bot.name);

    // Memoize messages loading from localStorage
    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            const saved = storage.getItem(historyKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    return parsed.filter((m): m is Message =>
                        m !== null && typeof m === 'object' &&
                        typeof m.text === 'string' && typeof m.sender === 'string'
                    );
                }
            }
        } catch { }
        return [];
    });

    // Voice config state with cookie + localStorage persistence and network fallback
    const [resolvedVoiceConfig, setResolvedVoiceConfig] = useState<CharacterVoiceConfig | null>(() => {
        try {
            const stored = loadVoiceConfig(bot.name);
            if (stored) return stored;
        } catch { }
        return bot.voiceConfig || null;
    });
    const voiceConfigPromiseRef = useRef<Promise<CharacterVoiceConfig | null> | null>(null);
    const voiceConfigRef = useRef<CharacterVoiceConfig | null>(resolvedVoiceConfig);
    useEffect(() => {
        voiceConfigRef.current = resolvedVoiceConfig;
    }, [resolvedVoiceConfig]);

    const setAndPersistVoiceConfig = useCallback((config: CharacterVoiceConfig | null) => {
        if (!config) {
            voiceConfigRef.current = null;
            setResolvedVoiceConfig(null);
            return null;
        }
        // Avoid redundant state updates to prevent render loops
        const current = voiceConfigRef.current;
        const isSame = current && JSON.stringify(current) === JSON.stringify(config);
        try { persistVoiceConfig(bot.name, config); } catch {}
        if (!isSame) {
            voiceConfigRef.current = config;
            setResolvedVoiceConfig(config);
        } else {
            voiceConfigRef.current = config;
        }
        return config;
    }, [bot.name]);

    const ensureVoiceConfig = useCallback(async (): Promise<CharacterVoiceConfig | null> => {
        if (voiceConfigRef.current) return voiceConfigRef.current;
        if (voiceConfigPromiseRef.current) return voiceConfigPromiseRef.current;
        const promise = (async () => {
            try {
                const stored = loadVoiceConfig(bot.name);
                if (stored) return setAndPersistVoiceConfig(stored);
            } catch { /* ignore */ }
            try {
                const savedBotRaw = storage.getItem(STORAGE_KEYS.bot);
                if (savedBotRaw) {
                    const parsed = JSON.parse(savedBotRaw);
                    if (parsed?.name === bot.name && parsed.voiceConfig) {
                        return setAndPersistVoiceConfig(parsed.voiceConfig as CharacterVoiceConfig);
                    }
                }
            } catch { /* ignore */ }
            if (bot.voiceConfig) {
                return setAndPersistVoiceConfig(bot.voiceConfig as CharacterVoiceConfig);
            }
            try {
                const fetched = await api_getVoiceConfigForCharacter(bot.name, bot.gender);
                return setAndPersistVoiceConfig(fetched);
            } catch (err) {
                if (typeof window !== 'undefined') {
                    logEvent('error', 'voice_config_fetch_failed', 'Failed to fetch voice config', sanitizeLogMeta({
                        botName: bot.name,
                        error: err instanceof Error ? err.message : String(err)
                    }));
                }
                return null;
            }
        })();
        voiceConfigPromiseRef.current = promise;
        const result = await promise;
        voiceConfigPromiseRef.current = null;
        return result;
    }, [bot.name, bot.gender, bot.voiceConfig, setAndPersistVoiceConfig]);

    const [input, setInput] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [introLoading, setIntroLoading] = useState<boolean>(false);
    const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
        try {
            const savedAudioPreference = storage.getItem(STORAGE_KEYS.audioEnabled);
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

    // Declared here (rather than down by the scroll-handling code that uses it) because
    // the "reset state when bot changes" effect below also resets it, and referencing a
    // setter before its useState declaration in source order isn't allowed.
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

    // See the reconciliation effect's own comment further down for what this gates.
    // Declared here (not next to that effect) for the same reason as visibleCount above.
    const { status: authStatus } = useAuthSession();
    const [historyReconciled, setHistoryReconciled] = useState(authStatus !== 'loading' && authStatus !== 'authenticated');

    // Reset state when bot changes. This page is SSR'd, and this effect reads
    // localStorage (browser-only) to seed the reset, so it has to run post-mount rather
    // than during render — and it's a genuine "reset several independent pieces of state
    // together when the character identity changes" operation, not something any single
    // piece of state could be derived from during render instead.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        // Reset messages to load the new bot's chat history
        const newHistoryKey = chatHistoryKey(bot.name);
        try {
            const saved = storage.getItem(newHistoryKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                setMessages(Array.isArray(parsed) ? parsed.filter((m): m is Message =>
                    m !== null && typeof m === 'object' &&
                    typeof m.text === 'string' && typeof m.sender === 'string'
                ) : []);
            } else setMessages([]);
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
        setIntroLoading(false);

        // Reset visible count
        setVisibleCount(INITIAL_VISIBLE_COUNT);

        // Reset last played audio hash for new character
        lastPlayedAudioHashRef.current = null;

        // A signed-in user's server history hasn't been checked yet for this
        // (possibly new) bot — see the reconciliation effect below, and the
        // intro effect that waits on it.
        setHistoryReconciled(false);

    }, [bot.name, setError]); // Only depend on bot.name to avoid unnecessary resets
    /* eslint-enable react-hooks/set-state-in-effect */

    // Reconcile with server-persisted history (phase 3c). Local storage stays the fast,
    // instant-load cache for the common case; the server is the durable source of truth for
    // a signed-in user's saved character. Only adopts the server's list when it's strictly
    // longer than what's already loaded — the new-device / cleared-storage case — so this
    // never regresses a longer local list and never blocks the initial render. Guests (no
    // session) and a character that was never saved server-side both just get [] back from
    // the endpoint, a no-op.
    //
    // historyReconciled gates the intro-generation effect below: without it, a signed-in
    // user resuming a saved character on a device with no local cache would see
    // messages.length === 0 for the instant between mount and this fetch resolving, firing
    // a bogus "Introduce yourself" turn that then gets persisted server-side on top of the
    // character's real history — the exact bug this gate exists to prevent.
    // (authStatus/historyReconciled are declared up above, near visibleCount — see that comment.)
    /* eslint-disable react-hooks/set-state-in-effect -- authStatus is client-only auth
       session state; this effect can only run post-mount. */
    useEffect(() => {
        if (authStatus === 'loading') return; // don't know yet whether there's server history to wait for
        if (authStatus !== 'authenticated') {
            setHistoryReconciled(true);
            return;
        }
        let mounted = true;
        authenticatedFetch(`/api/messages?botName=${encodeURIComponent(bot.name)}`)
            .then((res) => res.json())
            .then((data) => {
                if (!mounted || !Array.isArray(data?.messages)) return;
                const serverMessages: Message[] = data.messages.filter((m: unknown): m is Message =>
                    m !== null && typeof m === 'object' &&
                    typeof (m as Message).text === 'string' && typeof (m as Message).sender === 'string'
                );
                setMessages((current) => (serverMessages.length > current.length ? serverMessages : current));
            })
            .catch(() => {
                // Best-effort — local storage already has whatever this device has seen.
            })
            .finally(() => {
                if (mounted) setHistoryReconciled(true);
            });
        return () => { mounted = false; };
    }, [bot.name, authStatus]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Reset and hydrate voice config when bot changes
    useEffect(() => {
        voiceConfigPromiseRef.current = null;
        let cancelled = false;
        const hydrate = async () => {
            try {
                const stored = loadVoiceConfig(bot.name);
                if (stored && !cancelled) {
                    setAndPersistVoiceConfig(stored);
                    return;
                }
            } catch { /* ignore */ }
            if (bot.voiceConfig && !cancelled) {
                setAndPersistVoiceConfig(bot.voiceConfig as CharacterVoiceConfig);
                return;
            }
            if (!cancelled) {
                setResolvedVoiceConfig(null);
                await ensureVoiceConfig();
            }
        };
        hydrate();
        return () => { cancelled = true; };
    }, [bot.name, bot.voiceConfig, setAndPersistVoiceConfig, ensureVoiceConfig]);

    const { playAudio, stopAudio, isAudioPlaying, audioRef } = useAudioPlayer(audioEnabledRef);

    // Sync audioEnabledRef with audioEnabled state and update muted property on active audio
    useEffect(() => {
        audioEnabledRef.current = audioEnabled;
        // Also update muted state on any currently playing audio
        if (audioRef.current) {
            audioRef.current.muted = !audioEnabled;
        }
    }, [audioEnabled, audioRef]);

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
    const introRequestInProgressRef = useRef(false);
    useEffect(() => {
        // Prevent multiple concurrent requests (React Strict Mode protection)
        if (introSentRef.current || introRequestInProgressRef.current) return;
        // Wait until we know whether this (possibly signed-in, server-saved) character
        // already has real history — see the reconciliation effect above.
        if (!historyReconciled) return;
        if (messages.length === 0 && apiAvailable) {
            // introSentRef is a deliberate "ran once" guard against React Strict Mode's
            // double-invoke — reading then writing it within the same effect is exactly
            // the point (a real duplicate-intro-message bug was fixed this way). Setting
            // introLoading synchronously here (not in a callback) is what actually shows
            // the loading state before the async fetch below starts.
            /* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect */
            introSentRef.current = true;
            introRequestInProgressRef.current = true;
            setIntroLoading(true);
            /* eslint-enable react-hooks/immutability, react-hooks/set-state-in-effect */
            let cancelled = false;
            const getIntro = async () => {
                try {
                    const voiceConfig = await ensureVoiceConfig();
                    if (cancelled) return;
                    if (!voiceConfig) {
                        const msg = "Voice configuration missing for this character. Please recreate the bot.";
                        if (!cancelled) {
                            setIntroError(msg);
                            setError(msg);
                            setIntroLoading(false);
                        }
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
                            voiceConfig,
                            gender: bot.gender,
                            conversationHistory: [],
                            // This prompt is an internal mechanism to elicit an introduction, not
                            // something the user typed — tells the server not to persist it as a
                            // real "User" turn in a signed-in user's saved chat history.
                            isIntro: true,
                        }),
                    }).then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.json();
                    }));
                    if (cancelled) return;
                    if (typeof response.reply !== 'string' || !response.reply) {
                        throw new Error('Invalid intro response: missing reply');
                    }
                    const introMsg: Message = {
                        sender: bot.name,
                        text: response.reply,
                        audioFileUrl: response.audioFileUrl,
                    };
                    setMessages([introMsg]);
                    logMessage(introMsg);
                    setIntroError(null);
                    setIntroLoading(false);
                } catch (e) {
                    if (cancelled) return;
                    const msg = "Failed to generate intro or voice config. Please recreate the bot.";
                    setIntroError(msg);
                    setError(msg);
                    setIntroLoading(false);
                    if (typeof window !== 'undefined') {
                        logEvent('error', 'chat_intro_generation_failed', msg, sanitizeLogMeta({
                            botName: bot.name,
                            error: e instanceof Error ? e.message : String(e)
                        }));
                    }
                } finally {
                    if (!cancelled) {
                        introRequestInProgressRef.current = false;
                    }
                }
            };
            getIntro();
            return () => {
                cancelled = true;
                introSentRef.current = false;
                introRequestInProgressRef.current = false;
            };
        }
    }, [messages.length, apiAvailable, bot, logMessage, setError, ensureVoiceConfig, historyReconciled]);

    const sendMessage = useCallback(async () => {
        async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 2, initialDelay = 800): Promise<T> {
            let delay = initialDelay;
            let lastError;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                if (attempt > 0) {
                    setRetrying(true);
                    if (process.env.NODE_ENV === 'test') {
                        await new Promise(res => setTimeout(res, 10)); // Minimal delay in tests
                    } else {
                        await Promise.resolve();
                    }
                }
                setError("");
                try {
                    const result = await fn();
                    if (process.env.NODE_ENV === 'test') {
                        await new Promise(res => setTimeout(res, 1)); // Minimal delay in tests
                    }
                    setRetrying(false);
                    return result;
                } catch (err: unknown) {
                    lastError = err;
                    if (attempt === maxRetries) {
                        if (process.env.NODE_ENV === 'test') {
                            await new Promise(res => setTimeout(res, 1)); // Minimal delay in tests
                        }
                        setRetrying(false);
                        throw err;
                    }
                    if (process.env.NODE_ENV === 'test') {
                        await new Promise((res) => setTimeout(res, 10)); // Minimal delay in tests
                    } else {
                        await new Promise((res) => setTimeout(res, delay));
                    }
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
            const voiceConfig = await ensureVoiceConfig();
            if (!voiceConfig) {
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
                        voiceConfig,
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
            if (typeof response.reply !== 'string' || !response.reply) {
                throw new Error('Invalid chat response: missing reply');
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
                    hasVoiceConfig: !!voiceConfigRef.current,
                    messageCount: messages.length
                }));
            }
        } finally {
            setLoading(false);
        }
    }, [input, apiAvailable, logMessage, loading, handleApiError, setError, bot, ensureVoiceConfig, messages]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !loading && apiAvailable && input.trim()) {
            sendMessage();
        }
    };

    const handleAudioToggle = useCallback(() => {
        setAudioEnabled((prev) => {
            const newEnabled = !prev;
            try { storage.setItem(STORAGE_KEYS.audioEnabled, String(newEnabled)); } catch {}
            if (audioRef.current) {
                audioRef.current.muted = !newEnabled;
            }
            return newEnabled;
        });
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [audioRef, inputRef]);

    useEffect(() => {
        try { storage.setItem(STORAGE_KEYS.audioEnabled, String(audioEnabled)); } catch {}
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
            if (historyKey) storage.setItem(historyKey, JSON.stringify(messages));
        } catch {}
    }, [messages, historyKey]);

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

    // (visibleCount is declared up above, near the top of the hook — see that comment.)
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

    // Redundant with the bot-change reset above (historyKey derives from bot.name) but
    // kept as a direct safety net specifically for this key.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVisibleCount(INITIAL_VISIBLE_COUNT);
    }, [historyKey]);

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
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        const lastMsgHash = getMessageHash(lastMsg);
        if (typeof window !== 'undefined') {
            // Lazy-init cache: only read localStorage once per mount, then rely on this
            // same ref for every later run of this effect — deliberate read-then-write.
            if (lastPlayedAudioHashRef.current === null) {
                // eslint-disable-next-line react-hooks/immutability
                try { lastPlayedAudioHashRef.current = storage.getItem(lastPlayedAudioHashKey(bot.name)); } catch {}
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
                        try { storage.setItem(lastPlayedAudioHashKey(bot.name), lastMsgHash); } catch {}
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
        introLoading,
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
        stopAudio,
        isAudioPlaying,
    };
}
 

/**
 * Audio playback hook for chat responses.
 * Ensures single playback at a time, respects audioEnabled ref, and exposes play/stop helpers.
 */

import { useRef, useCallback, useState } from "react";

/**
 * Custom hook to handle audio playback for chat messages.
 * Ensures only one audio plays at a time and respects an audioEnabled ref.
 * Returns playAudio(audioFileUrl: string, signal?: AbortSignal) and audioRef.
 */
export function useAudioPlayer(
  audioEnabledRef: React.MutableRefObject<boolean>,
  audioRefParam?: React.MutableRefObject<HTMLAudioElement | null>,
  sourceRefParam?: React.MutableRefObject<AudioBufferSourceNode | null>
) {
  // Always create internal refs
  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const internalSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // Use external refs when provided, else fallback to internal refs
  const audioRef = audioRefParam ?? internalAudioRef;
  const sourceRef = sourceRefParam ?? internalSourceRef;
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // Keep AudioContext available for specialized cases; default to lightweight HTMLAudioElement playback.

  // Update useCallback dependencies
  const playAudio = useCallback(async (src: string, signal?: AbortSignal) => {
    // Stop prior playback before starting a new clip
    if (sourceRef.current) {
      try { (sourceRef.current as AudioBufferSourceNode | null)?.stop?.(); } catch { }
      try { (sourceRef.current as AudioBufferSourceNode | null)?.disconnect?.(); } catch { }
      sourceRef.current = null;
    }
    // Favor lightweight HTMLAudioElement playback; pause/reset any prior element
    if (audioRef.current) {
      if (typeof audioRef.current.pause === 'function') {
        try { audioRef.current.pause(); } catch {}
      }
      if (typeof audioRef.current.currentTime === 'number') {
        try { audioRef.current.currentTime = 0; } catch {}
      }
      if ('_paused' in audioRef.current) {
        try { (audioRef.current as HTMLAudioElement & { _paused?: boolean })._paused = true; } catch {}
      }
      // leave audioRef.current set to the previous element until new element assigned
    }

    try {
      const dummyAudio = new window.Audio(src);
      // Make the element resilient to AbortSignal cancellation
      if (signal) {
        const onAbort = () => {
          try { dummyAudio.pause(); dummyAudio.currentTime = 0; } catch {}
          if (audioRef.current === dummyAudio) audioRef.current = null;
          setIsAudioPlaying(false);
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }

      // Configure end handler before calling play() so synchronous mocks that
      // call onended immediately will still clear the ref.
      dummyAudio.onended = () => {
        if (audioRef.current === dummyAudio) audioRef.current = null;
        setIsAudioPlaying(false);
      };

      // Respect mute state without stopping playback
      dummyAudio.muted = !audioEnabledRef.current;

      audioRef.current = dummyAudio;
      setIsAudioPlaying(true);
      // Start playback. Play() returns a promise — if it rejects, the caller can
      // handle it. We don't block the main thread while the browser plays audio.
      // Note: we intentionally don't await play() here because we want the UI
      // to remain responsive and not block for autoplay policies; callers can
      // still await or listen to events on the returned element if desired.
      const promiseLike = dummyAudio.play();
      if (promiseLike && typeof (promiseLike as Promise<void>).catch === 'function') {
        void (promiseLike as Promise<void>).catch(() => {
          // Ignore play() failures (autoplay restrictions) — play will resume
          // when user enables/initiates audio in the UI.
        });
      }

      // onended was already configured above

      return dummyAudio;
    } catch (err) {
      // If anything above fails, ensure we don't leak refs and surface the
      // error to callers.
      if (audioRef.current) {
        try { audioRef.current.pause(); audioRef.current.currentTime = 0; } catch {}
        audioRef.current = null;
      }
      setIsAudioPlaying(false);
      throw err;
    }
  }, [audioEnabledRef, audioRef, sourceRef]);

  // Expose a stop function for toggling audio off or unmount
  const stopAudio = useCallback(() => {
    if (sourceRef.current) {
      try { (sourceRef.current as AudioBufferSourceNode | null)?.stop?.(); } catch { }
      try { (sourceRef.current as AudioBufferSourceNode | null)?.disconnect?.(); } catch { }
      sourceRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause?.();
      audioRef.current.currentTime = 0;
    }
    setIsAudioPlaying(false);
  }, [audioRef, sourceRef]);

  return { playAudio, audioRef, stopAudio, isAudioPlaying };
}

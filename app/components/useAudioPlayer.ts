// =============================
// useAudioPlayer.ts
// Custom React hook for managing audio playback (TTS responses, etc.).
// Returns playAudio function and audioRef for controlling playback in chat UI.
// =============================

import { useRef, useCallback } from "react";

/**
 * Custom hook to handle audio playback for chat messages.
 * Ensures only one audio plays at a time and respects an audioEnabled ref.
 * Returns playAudio(audioFileUrl: string) and audioRef.
 */
export function useAudioPlayer(audioEnabledRef: React.MutableRefObject<boolean>) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = useCallback((src: string) => {
    // If audio is disabled, do not play and do not replace dummy refs
    if (!audioEnabledRef.current) {
      if (audioRef.current) {
        if (typeof audioRef.current.pause === 'function' || typeof audioRef.current.currentTime === 'number') {
          audioRef.current = null;
        }
      }
      return null;
    }
    // Pause and reset previous audio if possible
    if (audioRef.current) {
      if (typeof audioRef.current.pause === 'function') {
        audioRef.current.pause();
      }
      if (typeof audioRef.current.currentTime === 'number') {
        try {
          audioRef.current.currentTime = 0;
        } catch {}
      }
      // If _paused property exists, set to true
      if ('_paused' in audioRef.current) {
        (audioRef.current as HTMLAudioElement & { _paused?: boolean })._paused = true;
      }
    }
    // Create new audio
    const audio = new Audio(src) as HTMLAudioElement & { _paused?: boolean };
    // If _paused property exists, set to false
    if ('_paused' in audio) {
      audio._paused = false;
    }
    // Play event: if audioEnabledRef becomes false, pause/reset
    const handlePlay = () => {
      if (!audioEnabledRef.current) {
        if (typeof audio.pause === 'function') audio.pause();
        if (typeof audio.currentTime === 'number') audio.currentTime = 0;
        if ('_paused' in audio) audio._paused = true;
      }
    };
    audio.addEventListener('play', handlePlay);
    // onended: cleanup audioRef only if this audio is still current
    audio.onended = () => {
      audio.removeEventListener('play', handlePlay);
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
    audioRef.current = audio;
    if (audioEnabledRef.current) {
      audio.play();
    }
    return audio;
  }, [audioEnabledRef]);

  return { playAudio, audioRef };
}

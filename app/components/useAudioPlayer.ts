// =============================
// useAudioPlayer.ts
// Custom React hook for managing audio playback (TTS responses, etc.).
// Returns playAudio function and audioRef for controlling playback in chat UI.
// =============================

import { useRef, useCallback } from "react";
import { authenticatedFetch } from "../../src/utils/api";

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

  const audioContextRef = useRef<AudioContext | null>(null);

  // Update useCallback dependencies
  const playAudio = useCallback(async (src: string, signal?: AbortSignal) => {
    if (!audioEnabledRef.current) {
      // Stop any previous Web Audio playback
      if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch { }
        try { sourceRef.current.disconnect(); } catch { }
        sourceRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current = null;
      }
      return null;
    }
    // Stop previous Web Audio playback
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { }
      try { sourceRef.current.disconnect(); } catch { }
      sourceRef.current = null;
    }
    if (audioRef.current) {
      if (typeof audioRef.current.pause === 'function') {
        audioRef.current.pause();
      }
      if (typeof audioRef.current.currentTime === 'number') {
        try {
          audioRef.current.currentTime = 0;
        } catch { }
      }
      if ('_paused' in audioRef.current) {
        (audioRef.current as HTMLAudioElement & { _paused?: boolean })._paused = true;
      }
    }
    // Use Web Audio API to prepend silence
    if (!audioContextRef.current) {
      const AnyWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
      audioContextRef.current = new (window.AudioContext || AnyWindow.webkitAudioContext!)();
    }
    const audioContext = audioContextRef.current;
    // Fetch audio data
    const response = await authenticatedFetch(src, { signal });
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    // Create a new buffer with silence prepended
    const silenceDuration = 0.5; // 500ms silence (reduced from 2000ms)
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const silenceLength = Math.floor(silenceDuration * sampleRate);
    const newBuffer = audioContext.createBuffer(
      numChannels,
      silenceLength + audioBuffer.length,
      sampleRate
    );
    // Fill silence
    for (let ch = 0; ch < numChannels; ch++) {
      const channel = newBuffer.getChannelData(ch);
      for (let i = 0; i < silenceLength; i++) {
        channel[i] = 0;
      }
      // Copy original audio
      channel.set(audioBuffer.getChannelData(ch), silenceLength);
    }
    // Play the new buffer
    const source = audioContext.createBufferSource();
    source.buffer = newBuffer;
    source.connect(audioContext.destination);
    sourceRef.current = source;
    source.start(0);
    // For compatibility with the rest of the app, create a dummy HTMLAudioElement
    const dummyAudio = new window.Audio();
    audioRef.current = dummyAudio;
    // Clean up after playback
    source.onended = () => {
      if (audioRef.current === dummyAudio) {
        audioRef.current = null;
      }
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
    };
    return dummyAudio;
  }, [audioEnabledRef, audioRef, sourceRef]);

  // Expose a stop function for toggling audio off or unmount
  const stopAudio = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { }
      try { sourceRef.current.disconnect(); } catch { }
      sourceRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause?.();
      audioRef.current.currentTime = 0;
    }
  }, [audioRef, sourceRef]);

  return { playAudio, audioRef, stopAudio };
}

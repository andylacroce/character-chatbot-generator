import { useEffect, useState } from "react";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { resolveApiUrl } from "./api";
import { loadAudioEnabled, saveAudioEnabled } from "./storage";

/**
 * TTS playback for a character's replies plus the persisted mute toggle, shared by
 * ChatScreen and GameScreen (mirrors the web app's useAudioPlayer + useAudioEnabled pair).
 */
export function useReplyAudio() {
  const [audioEnabled, setAudioEnabled] = useState(true);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    loadAudioEnabled().then(setAudioEnabled);
  }, []);

  /** Plays a reply's audio. Playback failing never fails the reply itself, which is already on screen. */
  const play = (audioFileUrl: string | undefined) => {
    if (!audioFileUrl || !audioEnabled) return;
    try {
      player.replace(resolveApiUrl(audioFileUrl));
      player.play();
    } catch {
      // Silently skip audio — the text reply is what matters.
    }
  };

  const toggleAudio = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    saveAudioEnabled(next);
    if (!next && status.playing) player.pause();
  };

  return {
    audioEnabled,
    toggleAudio,
    play,
    playing: status.playing,
    stop: () => player.pause(),
  };
}

export type ReplyAudio = ReturnType<typeof useReplyAudio>;

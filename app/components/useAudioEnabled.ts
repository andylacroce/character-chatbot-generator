import { useCallback, useEffect, useRef, useState } from "react";
import storage from "../../src/utils/storage";
import { STORAGE_KEYS } from "../../src/utils/storageKeys";

/**
 * Shared "is audio enabled" preference: initial value read from localStorage, a ref kept
 * in sync for useAudioPlayer's synchronous mute checks, and a toggle that persists the
 * change. Used identically by useChatController.ts and useGameController.ts so the mute
 * preference (and its storage key) can't drift between the two chat surfaces — extracted
 * after they'd each grown their own near-identical copy of this logic.
 */
export function useAudioEnabled() {
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    try {
      const saved = storage.getItem(STORAGE_KEYS.audioEnabled);
      if (saved !== null) return saved === "true";
    } catch {}
    return true;
  });
  const audioEnabledRef = useRef(audioEnabled);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
    try {
      storage.setItem(STORAGE_KEYS.audioEnabled, String(audioEnabled));
    } catch {}
  }, [audioEnabled]);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((prev) => !prev);
  }, []);

  return { audioEnabled, audioEnabledRef, toggleAudio };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { authenticatedFetch } from "../../../utils/api";
import { logEvent, sanitizeLogMeta } from "../../../utils/logger";
import { withViewTransition, type CharEntry } from "./charsGalleryHelpers";

/** Admin portrait-control state. Purge needs a second click ("confirm"); regenerate is one click. */
export type AdminState =
  "idle" | "confirm" | "purging" | "regenerating" | "purgeError" | "regenError";

/** Admin only: DELETE purges this character's cached portrait, POST regenerates it in place. */
async function adminPortraitCall(entry: CharEntry, method: "DELETE" | "POST") {
  const res = await authenticatedFetch("/api/admin/characters", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: entry.name }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

/**
 * The Character Wall's portrait lightbox (a native <dialog>): which portrait is open, the
 * admin purge/regenerate actions, and the `?name=` deep link that opens one on arrival.
 */
export function useGalleryLightbox(
  setCharacters: Dispatch<SetStateAction<CharEntry[]>>,
  initialCharacterName?: string,
) {
  const [selected, setSelected] = useState<CharEntry | null>(null);
  const [adminState, setAdminState] = useState<AdminState>("idle");
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Opens the native <dialog> lightbox. Wrapped in the View Transitions API when
  // the browser supports it, for a smooth cross-fade/morph into the enlarged
  // portrait instead of a hard cut — feature-detected, so unsupported browsers
  // (older Firefox/Safari) just get an instant open with no error.
  const openLightbox = useCallback((entry: CharEntry) => {
    withViewTransition(() => {
      setSelected(entry);
      dialogRef.current?.showModal();
    });
  }, []);

  const closeLightbox = useCallback(() => {
    withViewTransition(() => dialogRef.current?.close());
  }, []);

  /** Wire to the dialog's `onClose`, which fires for every way the dialog can close. */
  const handleDialogClose = useCallback(() => {
    setSelected(null);
    setAdminState("idle");
  }, []);

  const purgePortrait = async (entry: CharEntry) => {
    if (adminState !== "confirm") {
      setAdminState("confirm");
      return;
    }
    setAdminState("purging");
    try {
      await adminPortraitCall(entry, "DELETE");
      setCharacters((prev) => prev.filter((c) => c.name !== entry.name));
      dialogRef.current?.close();
    } catch (err) {
      logEvent(
        "error",
        "chars_purge_failed",
        "Admin portrait purge failed",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      setAdminState("purgeError");
    }
  };

  const regeneratePortrait = async (entry: CharEntry) => {
    setAdminState("regenerating");
    try {
      const { avatarUrl } = (await (await adminPortraitCall(entry, "POST")).json()) as {
        avatarUrl?: string;
      };
      if (!avatarUrl) throw new Error("missing avatarUrl");
      setCharacters((prev) => prev.map((c) => (c.name === entry.name ? { ...c, avatarUrl } : c)));
      setSelected({ ...entry, avatarUrl });
      setAdminState("idle");
    } catch (err) {
      logEvent(
        "error",
        "chars_regenerate_failed",
        "Admin portrait regeneration failed",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      setAdminState("regenError");
    }
  };

  // Carousel links carry only the character name so they stay small even when an
  // avatar is a large base64 data URL. Resolve that one cached entry independently
  // of the paginated wall, then open the same lightbox used by an ordinary tile.
  useEffect(() => {
    const requestedName = initialCharacterName?.trim();
    if (!requestedName) return;

    let cancelled = false;
    void authenticatedFetch(`/api/chars?name=${encodeURIComponent(requestedName)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.character) return;
        openLightbox(data.character as CharEntry);
      })
      .catch(() => {
        // The wall itself remains fully usable when this optional deep link fails.
      });

    return () => {
      cancelled = true;
    };
  }, [initialCharacterName, openLightbox]);

  return {
    dialogRef,
    selected,
    adminState,
    openLightbox,
    closeLightbox,
    handleDialogClose,
    purgePortrait,
    regeneratePortrait,
  };
}

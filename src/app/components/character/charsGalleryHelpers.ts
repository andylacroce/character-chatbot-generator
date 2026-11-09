import type { CharacterCategory } from "character-chatbot-shared";

/** One portrait on the Character Wall. */
export interface CharEntry {
  name: string;
  avatarUrl: string;
  category: CharacterCategory;
}

export type GallerySort = "newest" | "oldest" | "name-asc" | "name-desc";
export type GalleryGroup = "none" | "category";

export const PAGE_SIZE = 60;

export const SORT_OPTIONS: Array<{ value: GallerySort; label: string }> = [
  { value: "newest", label: "Recently added" },
  { value: "oldest", label: "Oldest added" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
];

/** Small stable string hash (djb2) so a tile's look is deterministic per name. */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/** A restrained, archival-print rotation from roughly -2.5..2.5deg. */
export function rotationDeg(name: string): number {
  const bucket = hashString(`rot:${name}`) % 11;
  return (bucket - 5) / 2;
}

/** Whether the browser supports the View Transitions API (Chromium/newer Safari). */
export function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

/** Runs `change`, wrapped in a View Transition when the browser supports one. */
export function withViewTransition(change: () => void): void {
  if (supportsViewTransitions()) {
    (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(
      change,
    );
  } else {
    change();
  }
}

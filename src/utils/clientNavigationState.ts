/**
 * In-memory (never persisted) flag recording whether this browser tab's already-running
 * app instance has performed at least one client-side route change.
 *
 * `window.history.length` cannot answer "does Back have a same-app destination?" — a
 * brand-new tab already starts with an `about:blank` entry ahead of the first real
 * navigation, so `history.length` reads 2 (not 1) the moment `/chars` loads directly,
 * making a naive `history.length > 1` check call `router.back()` into that blank entry
 * instead of falling back to `/`. This module-level flag is reset only by a hard reload
 * or a fresh tab (exactly the cases with no meaningful in-app Back target), and set the
 * moment any other route mounts, so it reflects real SPA navigation regardless of the
 * browser's own history bookkeeping.
 */
let hasNavigatedClientSide = false;

/** Marks that a client-side route change has occurred in this tab's app session. */
export function markClientNavigation(): void {
  hasNavigatedClientSide = true;
}

/** Returns whether at least one client-side route change has occurred this session. */
export function hasNavigatedWithinSession(): boolean {
  return hasNavigatedClientSide;
}

/** Test-only reset of the module-level navigation flag. */
export function __resetClientNavigationStateForTest(): void {
  hasNavigatedClientSide = false;
}

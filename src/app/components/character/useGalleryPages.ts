import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../../utils/api";
import { isCharacterCategory } from "character-chatbot-shared";
import {
  PAGE_SIZE,
  type CharEntry,
  type GalleryGroup,
  type GallerySort,
} from "./charsGalleryHelpers";

/**
 * Loads the Character Wall a page at a time for the given sort/group, with infinite
 * scroll. `sentinelCallbackRef` goes on the element whose entering view loads the next
 * page; `resetGalleryQuery` clears everything when the visitor changes a control.
 */
export function useGalleryPages(sortBy: GallerySort, groupBy: GalleryGroup) {
  const [characters, setCharacters] = useState<CharEntry[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const queryVersionRef = useRef(0);

  const loadMore = useCallback(
    async (reset = false) => {
      if (loadingRef.current || (!reset && !hasMoreRef.current)) return;
      const queryVersion = queryVersionRef.current;
      const offset = reset ? 0 : offsetRef.current;
      loadingRef.current = true;
      setLoadingMore(true);
      try {
        const res = await authenticatedFetch(
          `/api/chars?limit=${PAGE_SIZE}&offset=${offset}&sort=${sortBy}&group=${groupBy}`,
        );
        const data = await res.json();
        if (queryVersion !== queryVersionRef.current) return;
        const page: CharEntry[] = Array.isArray(data?.characters)
          ? data.characters.map((entry: CharEntry) => ({
              ...entry,
              category: isCharacterCategory(entry.category) ? entry.category : "other",
            }))
          : [];
        setCharacters((prev) => (reset ? page : [...prev, ...page]));
        offsetRef.current = offset + page.length;
        hasMoreRef.current = Boolean(data?.hasMore);
      } catch {
        if (queryVersion !== queryVersionRef.current) return;
        setError(true);
        hasMoreRef.current = false;
      } finally {
        if (queryVersion !== queryVersionRef.current) return;
        loadingRef.current = false;
        setLoadingMore(false);
        setInitialLoad(false);
      }
    },
    [groupBy, sortBy],
  );

  // Start the initial request and each request produced by a control-state change.
  // State clearing happens synchronously in the control event, not in this effect.
  useEffect(() => {
    void loadMore(true);
  }, [loadMore]);

  // Always call the *latest* loadMore from the observer below without needing to
  // recreate that observer every time loadMore's identity changes.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // Infinite scroll: fetch the next page when the sentinel enters view. A callback
  // ref (not useRef + a useEffect keyed on the sentinel) because the sentinel <div>
  // only exists once characters.length > 0 — a plain effect keyed on `loadMore`
  // would run once at mount, while the ref is still null, and never re-run once the
  // element actually appears (loadMore's identity doesn't change at that point). A
  // callback ref fires exactly when the DOM node itself is created or removed,
  // regardless of what else did or didn't change on that render.
  const sentinelObserverRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLDivElement | null>(null);
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    sentinelObserverRef.current?.disconnect();
    sentinelObserverRef.current = null;
    sentinelNodeRef.current = node;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    sentinelObserverRef.current = observer;
  }, []);

  // A page that doesn't grow the sentinel past the viewport (e.g. every group
  // collapsed, so a "grouped" page is just a few short headings; or simply a tall
  // viewport) never delivers a fresh intersection callback after the first one —
  // IntersectionObserver only fires on a threshold *crossing*, and a sentinel that
  // stays continuously visible across a content update never crosses back out.
  // Re-observing forces a fresh check of the current state, so pagination keeps
  // going instead of silently stalling after a page or two.
  useEffect(() => {
    const observer = sentinelObserverRef.current;
    const node = sentinelNodeRef.current;
    if (!observer || !node) return;
    observer.unobserve(node);
    observer.observe(node);
  }, [characters]);

  // A monotonically increasing version prevents a slower response from a prior
  // selection replacing current results when the visitor changes controls quickly.
  const resetGalleryQuery = useCallback(() => {
    queryVersionRef.current += 1;
    loadingRef.current = false;
    hasMoreRef.current = true;
    offsetRef.current = 0;
    setCharacters([]);
    setError(false);
    setInitialLoad(true);
  }, []);

  return {
    characters,
    setCharacters,
    initialLoad,
    loadingMore,
    error,
    resetGalleryQuery,
    sentinelCallbackRef,
  };
}

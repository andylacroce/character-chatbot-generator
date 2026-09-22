"use client";

/**
 * Public archival-mosaic gallery of every character portrait in the shared
 * avatar cache (see pages/api/chars.ts). Portraits are presented as an aged
 * parchment-backed mosaic rather than a conventional application grid.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "../../src/utils/api";
import { hasNavigatedWithinSession } from "../../src/utils/clientNavigationState";
import {
  CHARACTER_CATEGORIES,
  getCharacterCategoryLabel,
  isCharacterCategory,
  type CharacterCategory,
} from "../../src/utils/characterCategories";
import AppHeader from "./AppHeader";
import BackHomeLink from "./BackHomeLink";
import { useAccountMenu } from "./useAccountMenu";
import styles from "./styles/CharsPage.module.css";

interface CharEntry {
  name: string;
  avatarUrl: string;
  category: CharacterCategory;
}

type GallerySort = "newest" | "oldest" | "name-asc" | "name-desc";
type GalleryGroup = "none" | "category";

const PAGE_SIZE = 60;
const SORT_OPTIONS: Array<{ value: GallerySort; label: string }> = [
  { value: "newest", label: "Recently added" },
  { value: "oldest", label: "Oldest added" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
];

/** Small stable string hash (djb2) so a tile's look is deterministic per name. */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/** Stable mosaic size, chosen by name so pagination never changes a portrait's place. */
function sizeClass(name: string): string {
  const bucket = hashString(name) % 100;
  if (bucket < 55) return styles.s1;
  if (bucket < 85) return styles.s2;
  return styles.s3;
}

/** A restrained, archival-print rotation from roughly -2.5..2.5deg. */
function rotationDeg(name: string): number {
  const bucket = hashString(`rot:${name}`) % 11;
  return (bucket - 5) / 2;
}

/** Whether the browser supports the View Transitions API (Chromium/newer Safari). */
function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

/** One deckled archival print in the parchment mosaic. */
const CharTile: React.FC<{
  entry: CharEntry;
  onOpen: (entry: CharEntry) => void;
}> = ({ entry, onOpen }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      className={`${styles.tile} ${sizeClass(entry.name)}`}
      style={{ "--rot": `${rotationDeg(entry.name)}deg` } as React.CSSProperties}
      onClick={() => onOpen(entry)}
      title={entry.name}
      aria-label={`Open portrait of ${entry.name}`}
    >
      <div className={styles.photoFrame}>
        {!loaded && <div className={styles.skeleton} aria-hidden="true" />}
        {/* Plain <img>, not next/image: sources mix Vercel Blob URLs and base64 data
            URIs (see src/db/schema.ts's avatar_cache comment), and this gallery can
            have hundreds of tiles across pages — native lazy-loading is the right
            tool, on top of the infinite-scroll pagination that limits how many
            tiles even exist in the DOM at once. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={entry.avatarUrl}
          alt={entry.name}
          loading="lazy"
          decoding="async"
          className={styles.image}
          onLoad={() => setLoaded(true)}
        />
      </div>
      <div className={styles.caption}>{entry.name}</div>
    </button>
  );
};

/** Renders a dense masonry collage. */
const PortraitMosaic: React.FC<{
  entries: CharEntry[];
  groupLabel?: string;
  onOpen: (entry: CharEntry) => void;
}> = ({ entries, groupLabel, onOpen }) => (
  <div
    className={styles.mosaic}
    role="region"
    aria-label={`${groupLabel ? `${groupLabel} ` : ""}portrait collection`}
  >
    {entries.map((entry) => (
      <CharTile key={entry.name} entry={entry} onOpen={onOpen} />
    ))}
  </div>
);

/** Public /chars gallery: paginated, infinite-scroll mosaic of recognized portraits. */
const CharsGallery: React.FC = () => {
  const router = useRouter();
  const { menuItems, modals } = useAccountMenu();
  const [characters, setCharacters] = useState<CharEntry[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<CharEntry | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [sortBy, setSortBy] = useState<GallerySort>("newest");
  const [groupBy, setGroupBy] = useState<GalleryGroup>("none");
  const [expandedGroups, setExpandedGroups] = useState<Set<CharacterCategory>>(() => new Set());
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const queryVersionRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const topMarkerRef = useRef<HTMLDivElement>(null);

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
  // State clearing happens synchronously in the control event below, not in this effect.
  useEffect(() => {
    void loadMore(true);
  }, [loadMore]);

  // Always call the *latest* loadMore from the observer below without needing to
  // recreate that observer every time loadMore's identity changes.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // This app's flex-root layout makes BODY the scroll owner in Chromium, while
  // other engines may report window/documentElement/scrollingElement. Listen to
  // all of them and use the largest offset so visibility stays dynamic everywhere.
  useEffect(() => {
    const update = () => {
      const position = Math.max(
        window.scrollY,
        document.body.scrollTop,
        document.documentElement.scrollTop,
        document.scrollingElement?.scrollTop ?? 0,
      );
      setShowBackToTop(position > 360);
    };
    const targets: EventTarget[] = [window, document, document.body, document.documentElement];
    update();
    targets.forEach((target) => target.addEventListener("scroll", update, { passive: true }));
    return () => targets.forEach((target) => target.removeEventListener("scroll", update));
  }, []);

  const scrollToTop = useCallback(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    if (topMarkerRef.current) {
      topMarkerRef.current.scrollIntoView({ behavior, block: "start" });
      return;
    }
    document.scrollingElement?.scrollTo({ top: 0, behavior });
  }, []);

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

  // Opens the native <dialog> lightbox. Wrapped in the View Transitions API when
  // the browser supports it, for a smooth cross-fade/morph into the enlarged
  // portrait instead of a hard cut — feature-detected, so unsupported browsers
  // (older Firefox/Safari) just get an instant open with no error.
  const openLightbox = useCallback((entry: CharEntry) => {
    const open = () => {
      setSelected(entry);
      dialogRef.current?.showModal();
    };
    if (supportsViewTransitions()) {
      (
        document as Document & { startViewTransition: (cb: () => void) => void }
      ).startViewTransition(open);
    } else {
      open();
    }
  }, []);

  const closeLightbox = useCallback(() => {
    const close = () => dialogRef.current?.close();
    if (supportsViewTransitions()) {
      (
        document as Document & { startViewTransition: (cb: () => void) => void }
      ).startViewTransition(close);
    } else {
      close();
    }
  }, []);

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

  const toggleGroup = useCallback((category: CharacterCategory) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const galleryGroups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", entries: characters }];

    return CHARACTER_CATEGORIES.map(({ value, label }) => ({
      key: value,
      label,
      entries: characters.filter((entry) => entry.category === value),
    })).filter(({ entries }) => entries.length > 0);
  }, [characters, groupBy]);

  return (
    <>
      <div
        ref={topMarkerRef}
        className={styles.topMarker}
        data-testid="gallery-top-marker"
        aria-hidden="true"
      />
      <AppHeader
        menuItems={menuItems}
        left={
          <BackHomeLink
            label="Back"
            icon="back"
            onClick={(event) => {
              event.preventDefault();
              if (hasNavigatedWithinSession()) router.back();
              else router.push("/");
            }}
          />
        }
      />
      {modals}
      <div className={styles.page}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>Portrayal &nbsp;·&nbsp; The living collection</p>
          <h1 className={styles.title}>The Character Wall</h1>
          <div className={styles.flourish} aria-hidden="true">
            <span />
            <b>✦</b>
            <span />
          </div>
          <p className={styles.subtitle}>
            An ever-growing archive of imagined lives, gathered one portrait at a time.
          </p>
        </div>

        <div className={styles.controls} aria-label="Gallery arrangement">
          <label className={styles.control}>
            <span>Sort by</span>
            <select
              value={sortBy}
              onChange={(event) => {
                resetGalleryQuery();
                setSortBy(event.target.value as GallerySort);
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.groupToggle}>
            <input
              className={styles.toggleInput}
              type="checkbox"
              checked={groupBy === "category"}
              onChange={(event) => {
                resetGalleryQuery();
                setExpandedGroups(new Set());
                setGroupBy(event.target.checked ? "category" : "none");
              }}
            />
            <span className={styles.switchTrack} aria-hidden="true">
              <span />
            </span>
            <span className={styles.toggleLabel}>Group by category</span>
          </label>
        </div>

        {error && characters.length === 0 && (
          <p className={styles.state}>
            Couldn&apos;t load the gallery right now — try again in a bit.
          </p>
        )}
        {!error && initialLoad && <p className={styles.state}>Loading portraits&hellip;</p>}
        {!initialLoad && characters.length === 0 && !error && (
          <p className={styles.state}>No characters yet — go create the first one!</p>
        )}

        {characters.length > 0 && (
          <>
            <div className={styles.groupedGallery}>
              {galleryGroups.map((group) => (
                <section key={group.key} className={styles.galleryGroup}>
                  {group.label ? (
                    <>
                      <button
                        type="button"
                        className={styles.groupHeading}
                        aria-expanded={expandedGroups.has(group.key as CharacterCategory)}
                        aria-controls={`gallery-group-${group.key}`}
                        onClick={() => toggleGroup(group.key as CharacterCategory)}
                      >
                        <span className={styles.groupTitle}>
                          {getCharacterCategoryLabel(group.key)}
                        </span>
                        <span className={styles.groupChevron} aria-hidden="true">
                          ›
                        </span>
                      </button>
                      {expandedGroups.has(group.key as CharacterCategory) && (
                        <div id={`gallery-group-${group.key}`}>
                          <PortraitMosaic
                            entries={group.entries}
                            groupLabel={group.label}
                            onOpen={openLightbox}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <PortraitMosaic entries={group.entries} onOpen={openLightbox} />
                  )}
                </section>
              ))}
            </div>
            <div ref={sentinelCallbackRef} className={styles.sentinel} aria-hidden="true" />
            {loadingMore && <p className={styles.loadingMore}>Loading more&hellip;</p>}
          </>
        )}

        {/* Native <dialog> lightbox — showModal()/close() give focus-trapping and
          Escape-to-close for free, no modal library needed. Backdrop click closes
          it via the click-target check below; ::backdrop is styled in the CSS
          module for the dim/blur behind it. */}
        <dialog
          ref={dialogRef}
          className={styles.lightbox}
          onClick={(e) => {
            if (e.target === dialogRef.current) closeLightbox();
          }}
          onClose={() => setSelected(null)}
        >
          {selected && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.avatarUrl}
                alt={selected.name}
                className={styles.lightboxImage}
                onClick={closeLightbox}
              />
              <p className={styles.lightboxName}>{selected.name}</p>
              {/* Same launch point the landing page itself uses for a name typed
                into the creator (BotCreator's ?name= auto-submit effect) — it
                resumes this signed-in user's own saved character by that exact
                name if one exists, or creates a fresh one otherwise. */}
              <Link
                href={`/?name=${encodeURIComponent(selected.name)}`}
                className={styles.lightboxChat}
              >
                Chat with {selected.name} &rarr;
              </Link>
              <button
                type="button"
                className={styles.lightboxClose}
                aria-label="Close"
                onClick={closeLightbox}
              >
                &times;
              </button>
            </>
          )}
        </dialog>
      </div>
      {characters.length > 0 && (
        <button
          type="button"
          className={`${styles.toTop} ${showBackToTop ? styles.toTopVisible : ""}`.trim()}
          aria-label="Back to top"
          aria-hidden={!showBackToTop}
          tabIndex={showBackToTop ? 0 : -1}
          onClick={scrollToTop}
        >
          <span className={styles.toTopArrow} aria-hidden="true">
            &uarr;
          </span>
          <span className={styles.toTopLabel} aria-hidden="true">
            To top
          </span>
        </button>
      )}
    </>
  );
};

export default CharsGallery;

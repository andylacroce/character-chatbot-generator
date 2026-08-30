"use client";

/**
 * Public scrapbook-collage gallery of every character portrait in the shared
 * avatar cache (see pages/api/chars.ts) — every AI-generated character
 * portrait this app has ever produced, scattered across a corkboard like a
 * pile of old polaroids.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authenticatedFetch } from "../../src/utils/api";
import DarkModeToggle from "./DarkModeToggle";
import AuthControl from "./AuthControl";
import styles from "./styles/CharsPage.module.css";

interface CharEntry {
  name: string;
  avatarUrl: string;
}

const PAGE_SIZE = 60;

/** Small stable string hash (djb2) so a tile's look is deterministic per name. */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Polaroid frame width, chosen by a hash of the name rather than position —
 * looks like a hand-assembled pile instead of a repeating pattern, and stays
 * put across reloads and infinite-scroll pagination for the same character.
 */
function sizeClass(name: string): string {
  const bucket = hashString(name) % 100;
  if (bucket < 55) return styles.s1;
  if (bucket < 85) return styles.s2;
  return styles.s3;
}

/** Rotation angle, from a second hash bucket, mapped onto roughly -7..7deg. */
function rotationDeg(name: string): number {
  const bucket = hashString(`rot:${name}`) % 15;
  return bucket - 7;
}

const PIN_COLOR_CLASSES = [styles.pinClay, styles.pinTeal, styles.pinMoss, styles.pinRust];

/** Every photo gets a pushpin — only its color (from a third hash bucket) varies. */
function pinColorClass(name: string): string {
  const bucket = hashString(`pin:${name}`) % PIN_COLOR_CLASSES.length;
  return PIN_COLOR_CLASSES[bucket];
}

/** Whether the browser supports the View Transitions API (Chromium/newer Safari). */
function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

const CharTile: React.FC<{ entry: CharEntry; onOpen: (entry: CharEntry) => void }> = ({ entry, onOpen }) => {
  const tileRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Reveal-on-scroll: a native IntersectionObserver, not a library, drives the
  // rise-in — each tile only animates once, the first time it enters view.
  useEffect(() => {
    const el = tileRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entryObs]) => {
        if (entryObs.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={tileRef}
      className={`${styles.tile} ${sizeClass(entry.name)} ${pinColorClass(entry.name)} ${visible ? styles.tileIn : ""}`.trim()}
      style={{ "--rot": `${rotationDeg(entry.name)}deg` } as React.CSSProperties}
      onClick={() => onOpen(entry)}
      title={entry.name}
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
          className={`${styles.image} ${loaded ? styles.loaded : ""}`.trim()}
          onLoad={() => setLoaded(true)}
        />
      </div>
      <div className={styles.caption}>{entry.name}</div>
    </div>
  );
};

const CharsGallery: React.FC = () => {
  const [characters, setCharacters] = useState<CharEntry[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<CharEntry | null>(null);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const res = await authenticatedFetch(`/api/chars?limit=${PAGE_SIZE}&offset=${offsetRef.current}`);
      const data = await res.json();
      const page: CharEntry[] = Array.isArray(data?.characters) ? data.characters : [];
      setCharacters((prev) => [...prev, ...page]);
      offsetRef.current += page.length;
      setHasMore(Boolean(data?.hasMore));
    } catch {
      setError(true);
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
      setInitialLoad(false);
    }
  }, [hasMore]);

  // Initial page.
  useEffect(() => {
    loadMore();
    // Intentionally run once on mount — loadMore's own hasMore guard handles the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    sentinelObserverRef.current?.disconnect();
    sentinelObserverRef.current = null;
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
      (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(open);
    } else {
      open();
    }
  }, []);

  const closeLightbox = useCallback(() => {
    const close = () => dialogRef.current?.close();
    if (supportsViewTransitions()) {
      (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(close);
    } else {
      close();
    }
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link href="/" className={styles.back}>
          &larr; Back<span className={styles.backFull}> to Character Chatbot Generator</span>
        </Link>
        <div className={styles.topBarControls}>
          <DarkModeToggle className={styles.ghostIcon} hideLabel />
          <AuthControl className={styles.ghostAuth} />
        </div>
      </div>
      <div className={styles.header}>
        <h1 className={styles.title}>The Character Wall</h1>
      </div>

      {error && characters.length === 0 && (
        <p className={styles.state}>Couldn&apos;t load the gallery right now — try again in a bit.</p>
      )}
      {!error && initialLoad && <p className={styles.state}>Loading portraits&hellip;</p>}
      {!initialLoad && characters.length === 0 && !error && (
        <p className={styles.state}>No characters yet — go create the first one!</p>
      )}

      {characters.length > 0 && (
        <>
          <div className={styles.board}>
            {characters.map((entry, index) => (
              <CharTile key={`${entry.name}-${index}`} entry={entry} onOpen={openLightbox} />
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
            <img src={selected.avatarUrl} alt={selected.name} className={styles.lightboxImage} />
            <p className={styles.lightboxName}>{selected.name}</p>
            {/* Same launch point the landing page itself uses for a name typed
                into the creator (BotCreator's ?name= auto-submit effect) — it
                resumes this signed-in user's own saved character by that exact
                name if one exists, or creates a fresh one otherwise. */}
            <Link href={`/?name=${encodeURIComponent(selected.name)}`} className={styles.lightboxChat}>
              Chat with {selected.name} &rarr;
            </Link>
            <button type="button" className={styles.lightboxClose} aria-label="Close" onClick={closeLightbox}>
              &times;
            </button>
          </>
        )}
      </dialog>
    </div>
  );
};

export default CharsGallery;

"use client";

/**
 * Rotating carousel of recognized character portraits for the landing page's header
 * center slot — the same data `pages/api/chars.ts`/`CharsGallery.tsx` already serves.
 * Auto-advances through a small sample, pausing on hover/focus; clicking a portrait
 * jumps straight into chatting with that character via the same `/?name=<name>`
 * launch point `CharsGallery`'s own lightbox uses (`BotCreator`'s `nameFromUrl`
 * auto-launch effect resolves resume-vs-fresh-create — no new logic needed here).
 */

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "../../src/utils/api";
import { getJSON, setJSON } from "../../src/utils/storage";
import { STORAGE_KEYS } from "../../src/utils/storageKeys";
import styles from "./styles/LandingCharacterCarousel.module.css";

interface CharEntry {
  name: string;
  avatarUrl: string;
}

// Sample on the server so base64-backed portraits outside the rotation never cross
// the network. The pool still spans the newest 100 recognized characters.
const POOL_LIMIT = 100;
const ROTATE_COUNT = 20;
const ROTATE_MS = 4000;

/** Rotating, clickable sample of the shared character portrait cache, for the landing header. */
const LandingCharacterCarousel: React.FC = () => {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Paint last visit's sample immediately (read post-mount, not as useState's initializer,
    // so this client-only read never disagrees with the server-rendered placeholder markup
    // and trips a hydration mismatch) while a fresh sample loads underneath it — avoids the
    // header sitting on a blank placeholder for a cold /api/chars round trip on every visit.
    const cached = getJSON<{ characters: CharEntry[] }>(STORAGE_KEYS.landingCarouselCache);
    // Deliberately synchronous: this primes state from a client-only cache the instant
    // after mount, not in response to an external event, so the one-render lag this rule
    // otherwise guards against is the entire point here rather than a mistake.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (cached?.characters?.length) setCharacters(cached.characters);
    authenticatedFetch(`/api/chars?limit=${POOL_LIMIT}&sample=${ROTATE_COUNT}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const pool: CharEntry[] = Array.isArray(data?.characters) ? data.characters : [];
        if (pool.length === 0) return;
        setCharacters(pool);
        setIndex(0);
        setJSON(STORAGE_KEYS.landingCarouselCache, { characters: pool });
      })
      .catch(() => {
        /* Keep whatever's already showing (cached sample, or the reserved header space)
           if the fresh gallery request fails. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (paused || characters.length < 2) return;
    intervalRef.current = window.setInterval(() => {
      setIndex((i) => (i + 1) % characters.length);
    }, ROTATE_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [paused, characters.length]);

  useEffect(() => {
    if (characters.length < 2) return;
    const nextPortrait = new window.Image();
    nextPortrait.src = characters[(index + 1) % characters.length].avatarUrl;
  }, [characters, index]);

  if (characters.length === 0) {
    return (
      <div className={styles.carousel} aria-hidden="true">
        <span className={styles.portraitWrap}>
          <span className={`${styles.portrait} ${styles.portraitLoading}`} />
        </span>
        <span className={styles.nameLabel} />
      </div>
    );
  }

  const current = characters[index % characters.length];

  return (
    <button
      type="button"
      className={styles.carousel}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onClick={() => router.push(`/?name=${encodeURIComponent(current.name)}`)}
      aria-label={`Chat with ${current.name}`}
    >
      <span key={current.name} className={styles.portraitWrap}>
        {/* Plain <img>, not next/image: sources mix Vercel Blob URLs and base64 data
            URIs (see src/db/schema.ts's avatar_cache comment) — same reasoning as
            CharsGallery.tsx's own portrait tiles. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.avatarUrl}
          alt={current.name}
          className={styles.portrait}
          loading="eager"
          fetchPriority="high"
          width="140"
          height="140"
        />
      </span>
      <span key={`${current.name}-label`} className={styles.nameLabel}>
        {current.name}
      </span>
    </button>
  );
};

export default LandingCharacterCarousel;

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
import styles from "./styles/LandingCharacterCarousel.module.css";

interface CharEntry {
  name: string;
  avatarUrl: string;
}

// /api/chars orders by newest-first, not randomly — pulling its max page size (rather
// than a small fixed sample) gives a genuinely large pool to draw from, then this
// component shuffles client-side (see shuffled()) so the rotation isn't always the
// same dozen most-recently-created characters, and looks different on every visit.
const POOL_LIMIT = 100;
const ROTATE_COUNT = 20;
const ROTATE_MS = 4000;

/** Fisher-Yates shuffle, returning a new array (never mutates its input). */
function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Rotating, clickable sample of the shared character portrait cache, for the landing header. */
const LandingCharacterCarousel: React.FC = () => {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authenticatedFetch(`/api/chars?limit=${POOL_LIMIT}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const pool: CharEntry[] = Array.isArray(data?.characters) ? data.characters : [];
        setCharacters(shuffled(pool).slice(0, ROTATE_COUNT));
      })
      .catch(() => {
        /* No carousel on failure — the header still works with just its other slots. */
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

  if (characters.length === 0) return null;

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
        <img src={current.avatarUrl} alt={current.name} className={styles.portrait} />
      </span>
      <span key={`${current.name}-label`} className={styles.nameLabel}>
        {current.name}
      </span>
    </button>
  );
};

export default LandingCharacterCarousel;

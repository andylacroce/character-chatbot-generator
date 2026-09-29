"use client";

/**
 * Rotating carousel of recognized character portraits for the landing page's header
 * center slot — the same data `pages/api/chars.ts`/`CharsGallery.tsx` already serves.
 * Auto-advances through a small sample, pausing on hover/focus; clicking a portrait
 * opens that portrait in the Character Wall, where the visitor can choose to chat.
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "../../utils/api";
import { getJSON, setJSON } from "../../utils/storage";
import {
  displayCharacterName,
  CAROUSEL_SAMPLE_PATH,
  STORAGE_KEYS,
  useCharacterCarousel,
  type CarouselCache,
  type CharacterEntry,
} from "character-chatbot-shared";
import styles from "./styles/LandingCharacterCarousel.module.css";

const WEB_CAROUSEL_ROTATE_MS = 7000;

const cache: CarouselCache = {
  load: () =>
    getJSON<{ characters: CharacterEntry[] }>(STORAGE_KEYS.landingCarouselCache)?.characters ??
    null,
  save: (characters) => setJSON(STORAGE_KEYS.landingCarouselCache, { characters }),
};

/** Fetches a fresh server-side sample of recent portraits. */
async function fetchSample(): Promise<CharacterEntry[]> {
  const data = await authenticatedFetch(CAROUSEL_SAMPLE_PATH).then((res) => res.json());
  return Array.isArray(data?.characters) ? data.characters : [];
}

/**
 * Rotating, clickable sample of the shared character portrait cache, for the landing
 * header. Data, caching and rotation come from character-chatbot-shared's
 * useCharacterCarousel, shared with the mobile app's carousel.
 */
const LandingCharacterCarousel: React.FC = () => {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const { characters, index } = useCharacterCarousel({
    fetchSample,
    cache,
    paused,
    rotationMs: WEB_CAROUSEL_ROTATE_MS,
  });

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
        <span className={styles.scrim} />
        <span className={styles.nameLabel} />
      </div>
    );
  }

  const current = characters[index];

  return (
    <button
      type="button"
      className={styles.carousel}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onClick={() => router.push(`/chars?name=${encodeURIComponent(current.name)}`)}
      aria-label={`View ${displayCharacterName(current.name)} on the Character Wall`}
    >
      <span key={current.name} className={styles.portraitWrap}>
        {/* Plain <img>, not next/image: sources mix Vercel Blob URLs and base64 data
            URIs (see src/db/schema.ts's avatar_cache comment) — same reasoning as
            CharsGallery.tsx's own portrait tiles. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.avatarUrl}
          alt=""
          className={styles.portrait}
          loading="eager"
          fetchPriority="high"
        />
      </span>
      <span className={styles.scrim} aria-hidden="true" />
      <span key={`${current.name}-label`} className={styles.nameLabel}>
        {displayCharacterName(current.name)}
      </span>
    </button>
  );
};

export default LandingCharacterCarousel;

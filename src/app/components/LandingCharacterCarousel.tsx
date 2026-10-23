"use client";

/**
 * Rotating backdrop of recognized character portraits for the landing page — the same
 * data `pages/api/chars.ts`/`CharsGallery.tsx` already serves. Auto-advances through a
 * small sample, pausing on hover/focus of the name pill; clicking it opens that
 * portrait in the Character Wall, where the visitor can choose to chat.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "../../utils/api";
import { getJSON, setJSON } from "../../utils/storage";
import {
  displayCharacterName,
  CAROUSEL_SAMPLE_PATH,
  randomDrift,
  STORAGE_KEYS,
  useCharacterCarousel,
  type CarouselCache,
  type CharacterEntry,
} from "character-chatbot-shared";
import styles from "./styles/LandingCharacterCarousel.module.css";

const WEB_CAROUSEL_ROTATE_MS = 6000;

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

/** Small inline chevron for the previous/next buttons. */
const Chevron: React.FC<{ direction: "left" | "right" }> = ({ direction }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Rotating sample of the shared character portrait cache, as the landing page backdrop. Data, caching and rotation come from character-chatbot-shared's
 * useCharacterCarousel, shared with the mobile app's carousel.
 */
const LandingCharacterCarousel: React.FC = () => {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const { characters, index, step } = useCharacterCarousel({
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

  const currentName = characters[index]?.name;
  // A new random motion per portrait; the component renders nothing server-side, so the
  // random values can't cause a hydration mismatch.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-roll only when the portrait changes
  const drift = useMemo(() => randomDrift(), [currentName]);

  if (characters.length === 0) return null;

  const current = characters[index];

  // Full-page art behind the landing panels: the image layer ignores pointer events so
  // the form stays usable; only the caption is a (hover/focus-pausing) link to the Wall.
  return (
    <div className={styles.backdrop}>
      <span key={current.name} className={styles.backdropImage}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.avatarUrl}
          alt=""
          className={styles.portrait}
          loading="eager"
          style={
            {
              "--drift-scale-from": drift.scaleFrom,
              "--drift-scale-to": drift.scaleTo,
              "--drift-from": `${drift.fromX}% ${drift.fromY}%`,
              "--drift-to": `${drift.toX}% ${drift.toY}%`,
            } as React.CSSProperties
          }
        />
      </span>
      <span className={styles.backdropVeil} aria-hidden="true" />
      <div
        className={styles.backdropNav}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <button
          type="button"
          className={styles.backdropArrow}
          onClick={() => step(-1)}
          aria-label="Previous character"
        >
          <Chevron direction="left" />
        </button>
        <button
          type="button"
          className={styles.backdropCaption}
          onClick={() => router.push(`/characters?name=${encodeURIComponent(current.name)}`)}
          aria-label={`View ${displayCharacterName(current.name)} on the Character Wall`}
        >
          {displayCharacterName(current.name)}
        </button>
        <button
          type="button"
          className={styles.backdropArrow}
          onClick={() => step(1)}
          aria-label="Next character"
        >
          <Chevron direction="right" />
        </button>
      </div>
    </div>
  );
};

export default LandingCharacterCarousel;

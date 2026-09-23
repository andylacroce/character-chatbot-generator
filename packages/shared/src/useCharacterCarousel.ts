/**
 * The landing carousel's data and rotation, shared by the web app's LandingCharacterCarousel
 * and the mobile app's CharacterCarousel: a random server-side sample of recent portraits
 * (so unused, possibly large base64 portraits never cross the network), last visit's sample
 * repainted instantly from a local cache while a fresh one loads, and a 4-second rotation.
 * Each platform renders it its own way (the web preloads the next image; mobile flips
 * between portraits with haptics).
 */

import { useEffect, useState } from "react";
import type { CharacterEntry } from "./types";

/** Newest 100 recognized characters, 20 of them sampled at random by the server. */
export const CAROUSEL_SAMPLE_PATH = "/api/chars?limit=100&sample=20";
export const CAROUSEL_ROTATE_MS = 4000;

type MaybePromise<T> = T | Promise<T>;

export interface CarouselCache {
  load(): MaybePromise<CharacterEntry[] | null>;
  save(characters: CharacterEntry[]): void | Promise<void>;
}

export interface UseCharacterCarouselOptions {
  fetchSample(): Promise<CharacterEntry[]>;
  cache: CarouselCache;
  /** Holds the rotation, e.g. while hovered, focused, pressed, or disabled. */
  paused: boolean;
}

/** Shared carousel state, see module doc above. `index` always points into `characters`. */
export function useCharacterCarousel({ fetchSample, cache, paused }: UseCharacterCarouselOptions) {
  const [characters, setCharacters] = useState<CharacterEntry[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Read after mount (not in a state initializer) so a server render never disagrees
    // with the client's cached sample and trips a hydration mismatch on the web.
    Promise.resolve(cache.load()).then((cached) => {
      if (!cancelled && cached?.length) setCharacters((prev) => (prev.length ? prev : cached));
    });
    fetchSample()
      .then((pool) => {
        if (cancelled || pool.length === 0) return;
        setCharacters(pool);
        setIndex(0);
        void cache.save(pool);
      })
      .catch(() => {
        // Keep whatever's showing (the cached sample, or nothing) if the fetch fails.
      });
    return () => {
      cancelled = true;
    };
    // Once per mount; both platforms pass stable module-level functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (paused || characters.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % characters.length), CAROUSEL_ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, characters.length]);

  return { characters, index: characters.length ? index % characters.length : 0 };
}

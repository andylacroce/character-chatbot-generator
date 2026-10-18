/**
 * Read model for the public Character Wall: every cached portrait with its display name and
 * category, behind a short per-instance cache. Shared by the /api/chars route, the per-character
 * pages, and the sitemap.
 */

import { desc } from "drizzle-orm";
// Deep imports, not the package root: the root re-exports React hooks, which a Server Component bundle rejects.
import { isCharacterCategory } from "character-chatbot-shared/src/characterCategories";
import type { CharacterCategory } from "character-chatbot-shared/src/types";
import { characterSlug } from "character-chatbot-shared/src/validation";
import { getDb } from "../db/client";
import { avatarCache } from "../db/schema";

// Small connector words conventionally kept lowercase mid-name in English display text
// (e.g. "Joan of Arc", "Catherine de Medici", "Leonardo da Vinci", "Vincent van Gogh") —
// but still capitalized as the first or last word of a name.
const LOWERCASE_MID_NAME_WORDS = new Set([
  "of",
  "the",
  "a",
  "an",
  "and",
  "de",
  "da",
  "di",
  "du",
  "la",
  "le",
  "van",
  "von",
  "der",
  "den",
  "el",
  "al",
]);

// A regnal/ordinal suffix ("iii", "iv", "xiv") should render fully uppercase
// ("III", "IV", "XIV"), not just its first letter ("Iii") — matches on the Roman
// numeral alphabet only, so it never fires on an ordinary short word.
const ROMAN_NUMERAL = /^[ivxlcdm]+$/i;

/** "sherlock holmes" -> "Sherlock Holmes" for display; storage keeps it lowercased. */
function toDisplayName(name: string): string {
  const words = name.split(" ");
  return words
    .map((word, i) => {
      const isMidWord = i > 0 && i < words.length - 1;
      if (isMidWord && LOWERCASE_MID_NAME_WORDS.has(word.toLowerCase())) {
        return word.toLowerCase();
      }
      if (ROMAN_NUMERAL.test(word)) {
        return word.toUpperCase();
      }
      return word.replace(/\b\w/g, (c) => c.toUpperCase());
    })
    .join(" ");
}

/** One Wall entry: the display-cased name, portrait URL, taxonomy category, and creation time. */
export interface CharacterEntry {
  name: string;
  avatarUrl: string;
  category: CharacterCategory;
  createdAtMs: number;
}

// In-process cache of the full (already name-formatted) row list, refreshed at
// most once per TTL window. Infinite scroll on the gallery means every visitor
// fires several requests as they scroll — without this, that's several full
// table scans per visitor. avatar_cache only grows when a brand-new character
// name is generated for the very first time ever (itself already throttled by
// generate-avatar's own rate limit), so a minute of staleness costs nothing a
// visitor would notice. Per-instance only (resets on cold start, not shared
// across concurrent serverless instances) — same tradeoff class as the
// rate limiter's default MemoryStore; a real multi-instance cache would need
// the Redis store already wired up in rateLimitStore.ts, which isn't worth
// pulling in for a page whose data changes this slowly.
const CACHE_TTL_MS = 60_000;
let cache: { entries: CharacterEntry[]; fetchedAt: number } | null = null;

/** Drops the list cache so the next request re-reads `avatar_cache` (after an admin purge or regenerate). */
export function clearCharactersCache() {
  cache = null;
}

/** Returns every cached character's name/avatar, backed by the module-level TTL cache above. */
export async function getAllCharacters(): Promise<CharacterEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.entries;
  }
  const rows = await getDb().select().from(avatarCache).orderBy(desc(avatarCache.createdAt));
  const entries = rows.map((row) => ({
    // Prefer the properly-cased name captured at generation time (see
    // src/db/schema.ts's avatarCache.displayName doc comment) — the regex-based
    // reconstruction below is a fallback only for rows written before that column
    // existed.
    name: row.displayName || toDisplayName(row.characterName),
    avatarUrl: row.avatarUrl,
    category: isCharacterCategory(row.category) ? row.category : "other",
    createdAtMs: row.createdAt.getTime(),
  }));
  cache = { entries, fetchedAt: Date.now() };
  return entries;
}

/** Finds the Wall entry whose slug matches (the newest wins on a rare collision); null if none. */
export async function getCharacterBySlug(slug: string): Promise<CharacterEntry | null> {
  if (!slug) return null;
  const all = await getAllCharacters();
  return all.find((entry) => characterSlug(entry.name) === slug) ?? null;
}

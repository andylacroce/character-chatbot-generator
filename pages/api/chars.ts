/**
 * API endpoint listing every character portrait in the shared avatar cache, for the
 * public /chars mosaic page. avatar_cache is global and environment-agnostic (see
 * src/db/schema.ts) and contains no per-user data — every row is a character name and
 * an AI-generated portrait, already discoverable by anyone who types that name into
 * the character creator. GET-only, no auth required.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { avatarCache } from "../../src/db/schema";
import { createRateLimiter, applyRateLimit } from "../../src/utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";

/** Rate limiter: 60 requests per minute per IP — higher than most since infinite scroll on the gallery fires one request per batch. */
const charsRateLimit = createRateLimiter({
  name: "chars",
  max: 60,
  message: "Too many requests from this IP, please try again later.",
});

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

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

/** Parses a query-string integer param, falling back when absent/invalid/negative. */
function parseIntParam(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

interface CharacterEntry {
  name: string;
  avatarUrl: string;
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

/** Returns every recognized character's name/avatar, backed by the module-level TTL cache above. */
async function getAllCharacters(): Promise<CharacterEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.entries;
  }
  // Original characters (recognized: false — see src/db/schema.ts) are excluded: their
  // name/portrait means something only to the person who made them up, unlike a name
  // every visitor to this public gallery would actually recognize.
  const rows = await getDb()
    .select()
    .from(avatarCache)
    .where(eq(avatarCache.recognized, true))
    .orderBy(desc(avatarCache.createdAt));
  const entries = rows.map((row) => ({
    // Prefer the properly-cased name captured at generation time (see
    // src/db/schema.ts's avatarCache.displayName doc comment) — the regex-based
    // reconstruction below is a fallback only for rows written before that column
    // existed (or run through scripts/backfill-avatar-display-names.cjs).
    name: row.displayName || toDisplayName(row.characterName),
    avatarUrl: row.avatarUrl,
  }));
  cache = { entries, fetchedAt: Date.now() };
  return entries;
}

/**
 * Next.js API route handler for listing every cached character portrait.
 *
 * @swagger
 * /chars:
 *   get:
 *     summary: List every character portrait in the shared avatar cache
 *     description: >
 *       Public, no-auth gallery data for the /chars mosaic page, paginated so a large
 *       gallery doesn't have to load (or render) all at once. Returns an empty list
 *       (never an error) when no DATABASE_URL is configured. Newest portraits first.
 *     tags: [Chars]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 60
 *           maximum: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: One page of the character portrait gallery
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 characters:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       avatarUrl:
 *                         type: string
 *                 hasMore:
 *                   type: boolean
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to list characters
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(charsRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    res.status(200).json({ characters: [], hasMore: false });
    return;
  }

  const limit = Math.min(parseIntParam(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT) || DEFAULT_LIMIT;
  const offset = parseIntParam(req.query.offset, 0);

  try {
    const all = await getAllCharacters();
    const page = all.slice(offset, offset + limit);

    res.status(200).json({
      characters: page,
      hasMore: offset + limit < all.length,
    });
  } catch (err) {
    logEvent(
      "error",
      "chars_list_failed",
      "Failed to list characters",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    res.status(500).json({ error: "Failed to list characters" });
  }
}

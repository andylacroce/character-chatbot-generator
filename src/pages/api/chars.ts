/**
 * API endpoint listing every character portrait in the shared avatar cache, for the
 * public /chars mosaic page. avatar_cache is global and environment-agnostic (see
 * src/db/schema.ts) and contains no per-user data — every row is a character name and
 * an AI-generated portrait, already discoverable by anyone who types that name into
 * the character creator. GET-only, no auth required.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getAllCharacters, type CharacterEntry } from "../../utils/charactersWall";
import { createRateLimiter, applyRateLimit } from "../../utils/rateLimit";
import { logEvent, sanitizeLogMeta } from "../../utils/logger";
import { withRequestLog } from "../../utils/withRequestLog";
import { getCharacterCategoryOrder } from "character-chatbot-shared";

/** Rate limiter: 60 requests per minute per IP — higher than most since infinite scroll on the gallery fires one request per batch. */
const charsRateLimit = createRateLimiter({
  name: "chars",
  max: 60,
  message: "Too many requests from this IP, please try again later.",
});

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;
const GALLERY_SORTS = ["newest", "oldest", "name-asc", "name-desc"] as const;
const GALLERY_GROUPS = ["none", "category"] as const;

type GallerySort = (typeof GALLERY_SORTS)[number];
type GalleryGroup = (typeof GALLERY_GROUPS)[number];

/** Parses a query-string integer param, falling back when absent/invalid/negative. */
function parseIntParam(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Parses a finite query option, returning the declared fallback for unknown values. */
function parseOption<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && options.includes(value as T) ? (value as T) : fallback;
}

/** Orders the cached full list before pagination so sorting stays correct across pages. */
function orderCharacters(
  entries: CharacterEntry[],
  sort: GallerySort,
  group: GalleryGroup,
): CharacterEntry[] {
  return [...entries].sort((a, b) => {
    if (group === "category") {
      const categoryOrder =
        getCharacterCategoryOrder(a.category) - getCharacterCategoryOrder(b.category);
      if (categoryOrder !== 0) return categoryOrder;
    }

    if (sort === "oldest") return a.createdAtMs - b.createdAtMs;
    if (sort === "name-asc") return a.name.localeCompare(b.name);
    if (sort === "name-desc") return b.name.localeCompare(a.name);
    return b.createdAtMs - a.createdAtMs;
  });
}

/** Randomizes a copy of a page so small clients can sample without downloading every avatar. */
function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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
 *         name: name
 *         description: >
 *           When present, bypasses pagination and returns one case-insensitive name
 *           match, or a null character if none exists. Used by the landing carousel
 *           to open a specific Character Wall lightbox.
 *         schema:
 *           type: string
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
 *       - in: query
 *         name: sample
 *         description: Randomly return up to this many entries from the selected page; used by the landing carousel.
 *         schema:
 *           type: integer
 *           maximum: 100
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, name-asc, name-desc]
 *           default: newest
 *       - in: query
 *         name: group
 *         description: Category grouping makes category the primary ordering key.
 *         schema:
 *           type: string
 *           enum: [none, category]
 *           default: none
 *     responses:
 *       200:
 *         description: One page of the portrait gallery, or one character when `name` is present
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
 *                       category:
 *                         type: string
 *                         enum: [history, mythology, literature, folklore, religion, other]
 *                 hasMore:
 *                   type: boolean
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to list characters
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await applyRateLimit(charsRateLimit, req, res))) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const lookupName = typeof req.query.name === "string" ? req.query.name.trim() : "";

  if (!process.env.DATABASE_URL) {
    res.status(200).json(lookupName ? { character: null } : { characters: [], hasMore: false });
    return;
  }

  // Single-character lookup, used by the landing carousel's "open this character's
  // wall lightbox" link — bypasses pagination/sort entirely rather than requiring the
  // caller to scan pages looking for one name. Matched against the same formatted
  // display name getAllCharacters() already returns, case-insensitively, since that's
  // exactly what the carousel's own sample API already handed the client.
  if (lookupName) {
    try {
      const all = await getAllCharacters();
      const needle = lookupName.toLowerCase();
      const match = all.find((entry) => entry.name.toLowerCase() === needle);
      res.status(200).json({
        character: match
          ? { name: match.name, avatarUrl: match.avatarUrl, category: match.category }
          : null,
      });
    } catch (err) {
      logEvent(
        "error",
        "chars_lookup_failed",
        "Failed to look up a single character",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
      res.status(500).json({ error: "Failed to look up character" });
    }
    return;
  }

  const limit = Math.min(parseIntParam(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT) || DEFAULT_LIMIT;
  const offset = parseIntParam(req.query.offset, 0);
  const sample = Math.min(parseIntParam(req.query.sample, 0), limit);
  const sort = parseOption(req.query.sort, GALLERY_SORTS, "newest");
  const group = parseOption(req.query.group, GALLERY_GROUPS, "none");

  try {
    const all = await getAllCharacters();
    const ordered = orderCharacters(all, sort, group);
    const candidates = ordered.slice(offset, offset + limit);
    const page = (sample ? shuffled(candidates).slice(0, sample) : candidates).map(
      ({ createdAtMs: _, ...entry }) => entry,
    );

    res.status(200).json({
      characters: page,
      hasMore: offset + limit < ordered.length,
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

export default withRequestLog(handler);

/**
 * Core avatar generation pipeline, extracted from app/api/generate-avatar/route.ts so it can
 * be called in-process by both that route and the guessing game (src/utils/game/round.ts,
 * guess.ts) without an internal HTTP self-fetch. Uses Claude to build a detailed image
 * prompt, then renders it on free image providers only — Cloudflare Workers AI (Flux
 * Schnell) first, falling back to Pollinations.ai if Cloudflare isn't configured or
 * fails, and finally the `/silhouette.svg` placeholder if neither returns an image.
 *
 * `characterName` is expected to already be sanitized/trusted by the caller (this
 * module does no sanitization itself), matching generatePersonalityPrompt's contract.
 */

import { logEvent, sanitizeLogMeta } from "../logger";
import { generateImageWithCloudflare } from "./cloudflareImageGen";
import { generateImageWithPollinations } from "./pollinationsImageGen";
import { recordEvent } from "../analytics";
import { deleteOrphanedAvatars } from "../account/userBlobs";
import type { CharacterCategory } from "character-chatbot-shared/src/core";
import { buildAvatarPrompt } from "./avatarPrompt";
import { cacheAvatar, getCachedAvatar, persistAvatarToBlob } from "./avatarCache";

export {
  scrubCachedAvatar,
  purgeCachedAvatar,
  scrubUserBotsByName,
  setCachedCategory,
} from "./avatarCache";

/** Options controlling avatar cache/persistence behavior — see app/api/generate-avatar/route.ts's @swagger block for the full rationale on each. */
export interface AvatarGenerationOptions {
  skipPersistence?: boolean;
  /** Skip the cache read and generate anew; the new image overwrites the cached row. */
  refresh?: boolean;
  /**
   * Consulted only on a cache miss, just before a brand-new portrait would be written to the shared
   * (public) cache. Returning false renders it privately instead, as if skipPersistence were set.
   */
  mayPersistNew?: () => Promise<boolean>;
}

export interface AvatarGenerationResult {
  avatarUrl: string;
  gender: string | null;
  source: "cache" | "cloudflare" | "pollinations" | "silhouette";
}

/**
 * Admin regeneration of one character's shared portrait: generates a new image and swaps it
 * into the cache row in place, so a failed generation leaves the old portrait untouched. The
 * old Blob image is deleted afterwards if no saved character still uses it. Returns the new
 * URL, or null when generation fell back to the silhouette (nothing changed).
 */
export async function regenerateCachedAvatar(name: string): Promise<string | null> {
  const old = await getCachedAvatar(name);
  const result = await getOrGenerateAvatar(name, { refresh: true });
  if (result.source === "silhouette") return null;
  if (old && old.avatarUrl !== result.avatarUrl) {
    try {
      await deleteOrphanedAvatars([old.avatarUrl]);
    } catch (err) {
      logEvent(
        "warn",
        "avatar_regenerate_blob_failed",
        "Regenerated avatar but left the old Blob image behind",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
    }
  }
  return result.avatarUrl;
}

/**
 * Resolves an avatar for a character name: a shared cache hit, or a fresh two-stage
 * generation (Claude image prompt, then a free image provider). Never throws — any
 * failure degrades to the `/silhouette.svg` placeholder, same as the route this was
 * extracted from.
 */
export async function getOrGenerateAvatar(
  characterName: string,
  opts: AvatarGenerationOptions = {},
): Promise<AvatarGenerationResult> {
  let bypassPersistence = opts.skipPersistence === true;
  let bypassSharedCache = bypassPersistence;

  const cached = bypassSharedCache || opts.refresh ? null : await getCachedAvatar(characterName);
  if (cached) {
    logEvent(
      "info",
      "avatar_cache_hit",
      "Reusing cached avatar",
      sanitizeLogMeta({ name: characterName }),
    );
    await recordEvent("avatar_generated", {
      provider: "cache",
      recognized: true,
      bypassSharedCache,
    });
    return { avatarUrl: cached.avatarUrl, gender: cached.gender, source: "cache" };
  }

  if (!bypassPersistence && opts.mayPersistNew && !(await opts.mayPersistNew())) {
    bypassPersistence = true;
    bypassSharedCache = true;
  }

  let genderOut: string | null = null;
  let categoryOut: CharacterCategory | null = null;

  try {
    logEvent(
      "info",
      "avatar_generate_start",
      "Avatar generation started",
      sanitizeLogMeta({ name: characterName }),
    );

    // Step 1: Build image prompt using Claude
    const built = await buildAvatarPrompt(characterName);
    const prompt = built.prompt;
    genderOut = built.gender;
    categoryOut = built.category;

    // Step 2: Generate image — free providers only, no paid path in this branch.
    // Cloudflare Workers AI first (when configured), falling back to Pollinations.ai
    // if Cloudflare isn't configured or fails — including exhausting its free daily
    // neuron allocation, which Pollinations has no comparable cap on. Same
    // degrade-gracefully shape as Blob upload and the avatar cache elsewhere in this
    // module: a missing/failing provider never blocks generation outright when
    // another free path is available.
    let avatarUrl: string | null = null;
    let usedProvider: "cloudflare" | "pollinations" | null = null;

    try {
      avatarUrl = await generateImageWithCloudflare(prompt);
      if (avatarUrl) {
        usedProvider = "cloudflare";
        logEvent(
          "info",
          "avatar_cloudflare_success",
          "Image generated successfully with Cloudflare Workers AI",
        );
      }
    } catch (err) {
      logEvent(
        "error",
        "avatar_cloudflare_error",
        "Cloudflare Workers AI image generation error",
        sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
      );
    }

    if (!avatarUrl) {
      try {
        avatarUrl = await generateImageWithPollinations(prompt);
        if (avatarUrl) {
          usedProvider = "pollinations";
          logEvent(
            "info",
            "avatar_pollinations_success",
            "Image generated successfully with Pollinations.ai",
          );
        }
      } catch (err) {
        logEvent(
          "error",
          "avatar_pollinations_error",
          "Pollinations.ai image generation error",
          sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
        );
      }
    }

    if (!avatarUrl) {
      logEvent(
        "warn",
        "avatar_generation_failed",
        "No provider returned an image, using silhouette",
      );
      await recordEvent("avatar_generated", {
        provider: "none",
        recognized: true,
        bypassSharedCache,
      });
      return { avatarUrl: "/silhouette.svg", gender: genderOut, source: "silhouette" };
    }

    if (!bypassPersistence) {
      avatarUrl = await persistAvatarToBlob(avatarUrl);
    }

    // A portrait with no valid category never enters the shared cache (it would sit on no
    // Wall group); the next request for the name classifies it again.
    if (!bypassSharedCache && (categoryOut || opts.refresh)) {
      await cacheAvatar(characterName, avatarUrl, genderOut, true, categoryOut);
    }
    await recordEvent("avatar_generated", {
      provider: usedProvider,
      recognized: true,
      bypassSharedCache,
    });
    return { avatarUrl, gender: genderOut, source: usedProvider ?? "silhouette" };
  } catch (e) {
    logEvent(
      "error",
      "avatar_unhandled_error",
      "Unhandled error in avatar generation",
      sanitizeLogMeta({ error: e instanceof Error ? e.message : String(e) }),
    );
    return { avatarUrl: "/silhouette.svg", gender: null, source: "silhouette" };
  }
}

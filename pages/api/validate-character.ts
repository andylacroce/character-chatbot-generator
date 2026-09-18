/**
 * API endpoint for validating character names against copyright and trademark concerns.
 * Uses Claude to determine if a character is likely protected by copyright or trademark.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeLogMeta } from "../../src/utils/logger";
import { getClaudeModel } from "../../src/utils/claudeModelSelector";
import { createRateLimiter, applyRateLimit } from "../../src/utils/rateLimit";
import { extractJson } from "../../src/utils/parseClaudeJson";
import anthropic from "../../src/utils/anthropicClient";
import { recordEvent } from "../../src/utils/analytics";
import { scrubCachedAvatar, scrubUserBotsByName } from "../../src/utils/avatarGeneration";
import {
  getBlocklistEntry,
  addToBlocklist,
  removeFromBlocklist,
} from "../../src/utils/characterBlocklist";
import { isAllowlisted } from "../../src/utils/characterAllowlist";
import { logWarning } from "../../src/utils/characterWarningLog";

const SCRUBBED_REASON = "This character is no longer available. Please try a different name.";
// Matches useBotCreation.ts's own hardcoded message for a `blocked: true` result —
// the client doesn't actually read this `reason` string for that path, but it's set
// here anyway for API/log consistency with what the user actually sees.
const CONTENT_BLOCKED_REASON = "That name isn't allowed. Please choose a different name.";

/** Rate limiter: 30 requests per minute per IP. */
const validationRateLimit = createRateLimiter({
  name: "validate-character",
  max: 30,
  message: "Too many validation requests from this IP, please try again later.",
});

export interface CharacterValidationResult {
  characterName: string;
  isPublicDomain: boolean;
  isSafe: boolean;
  warningLevel: "none" | "caution" | "warning";
  reason?: string;
  suggestions?: string[];
  // Set for either of two independent reasons — distinct from warningLevel (which is
  // copyright/trademark-only and always overridable via "Continue Anyway"): (1) the
  // name itself is profane, a slur, or otherwise abusive, or (2) it identifies a
  // real, currently-living person with a serious, well-documented real-world
  // criminal conviction or extensive credible allegations of serious criminal
  // conduct (added 2026-09-17 after a live report — deliberately excludes
  // historical/deceased figures however controversial, and ordinary celebrity/
  // political controversy; only serious real-world criminal conduct by someone
  // still alive today). A blocked name has no override either way: the character
  // wall at /chars is public, so a name like this can't be allowed to exist at all,
  // not just flagged with a warning.
  blocked?: boolean;
  // True when this is an actual character/person Claude has real knowledge of
  // (fictional or historical) — false when the name doesn't correspond to anything
  // Claude recognizes, i.e. it looks like an original character. Defaults to true
  // (fail open, same as the other fields) so a validation error never blocks
  // creation. useBotCreation.ts uses `=== false` specifically to prompt for a
  // description, so leaving this true/undefined preserves the direct-create path.
  recognized?: boolean;
  // Set two ways: (1) this name is already on the persistent blocklist
  // (src/utils/characterBlocklist.ts — a prior "warning" or a manual admin block),
  // so this request never even reached Claude; or (2) this name was already cached
  // (a previously-generated, previously-public character on the Character Wall/
  // carousel) and this request's live re-check just flagged it as a "warning"-level
  // copyright/trademark concern, deleting the cached row server-side. Either way,
  // unlike an ordinary warningLevel "warning", this is never overridable — "Continue
  // Anyway" would just regenerate the exact same flagged name. useBotCreation.ts
  // treats this as a hard stop with a generic message, the same non-overridable
  // shape as `blocked`.
  scrubbed?: boolean;
}

/**
 * Next.js API route handler for validating character names.
 * Returns whether the character is safe to use, if copyright/trademark concerns
 * exist, and whether the name itself must be hard-blocked (abusive content, or a
 * living person with serious real-world legal risk).
 *
 * @swagger
 * /validate-character:
 *   post:
 *     summary: Validate a character name for copyright/trademark concerns and hard-block content
 *     description: >
 *       A name on the curated public-domain allowlist (src/utils/characterAllowlist.ts)
 *       or the persistent blocklist (src/utils/characterBlocklist.ts) short-circuits
 *       straight to a result without ever calling Claude. Otherwise uses Claude for two
 *       independent checks: whether the name is public-domain-safe, cautionary, or a
 *       clear copyright/trademark violation (warningLevel — always overridable), and
 *       whether the name must be hard-blocked (blocked — never overridable, since
 *       created characters appear on the public /chars gallery) because it's itself
 *       profane/abusive OR identifies a real, currently-living person with a serious
 *       real-world criminal conviction/allegation (historical/deceased figures and
 *       ordinary celebrity controversy are deliberately excluded from this second
 *       reason). A "warning" or a `blocked: true` result is each added to the
 *       blocklist for future consistency, tagged with which of the two it was; either
 *       way, if the name was already cached from a prior generation (or saved by a
 *       user to their own account), that's also deleted/scrubbed and scrubbed: true is
 *       set on a "warning"-driven scrub (never overridable either way — `blocked: true`
 *       is already never-overridable regardless). Rate limited to 30 requests/minute/IP.
 *       On an internal error, responds 200 with warningLevel "none" and blocked false
 *       rather than blocking creation.
 *     tags: [Character]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Mickey Mouse
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 characterName:
 *                   type: string
 *                 isPublicDomain:
 *                   type: boolean
 *                 isSafe:
 *                   type: boolean
 *                 warningLevel:
 *                   type: string
 *                   enum: [none, caution, warning]
 *                 reason:
 *                   type: string
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 blocked:
 *                   type: boolean
 *                   description: >
 *                     True when the name itself is profane/abusive, OR it identifies
 *                     a real, currently-living person with a serious real-world
 *                     criminal conviction/allegation — distinct from warningLevel
 *                     (copyright-only, always overridable). Never overridable: the
 *                     character wall at /chars is public.
 *                 recognized:
 *                   type: boolean
 *                   description: >
 *                     False when the name doesn't correspond to any character/person
 *                     Claude actually knows about (an original character). The client
 *                     prompts for a free-form description in that case, sent to
 *                     /generate-personality to build the personality instead of
 *                     relying on Claude to invent one from the name alone.
 *                 scrubbed:
 *                   type: boolean
 *                   description: >
 *                     True when this name was already cached (previously public on
 *                     the Character Wall/carousel) and this call's re-check flagged
 *                     it as a "warning"-level copyright/trademark concern — the
 *                     cached row has already been deleted server-side. Never
 *                     overridable, unlike an ordinary warningLevel "warning" for a
 *                     brand-new name.
 *       400:
 *         description: Valid character name required
 *       405:
 *         description: Method not allowed
 *       429:
 *         description: Rate limit exceeded
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    logEvent(
      "warn",
      "validate_character_method_not_allowed",
      "Validate character API method not allowed",
      sanitizeLogMeta({
        method: req.method,
      }),
    );
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Apply rate limiting
  if (!(await applyRateLimit(validationRateLimit, req, res))) {
    return;
  }

  const { name } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Valid character name required" });
    return;
  }

  const characterName = name.trim();

  // Fastest path: a name on the curated public-domain list or the admin-managed
  // allowlist table (src/utils/characterAllowlist.ts) is permanently safe regardless
  // of what any single Claude roll says — found necessary after a live sweep showed
  // Claude flagging "warning" on names from that exact curated list (Sherlock Holmes,
  // Thor, Winnie-the-Pooh) purely because a studio also made a popular adaptation.
  // Also self-heals a stale blocklist entry for the same name, in case an earlier bad
  // roll put it there before this allowlist existed.
  if (await isAllowlisted(characterName)) {
    void removeFromBlocklist(characterName);
    const result: CharacterValidationResult = {
      characterName,
      isPublicDomain: true,
      isSafe: true,
      warningLevel: "none",
      reason: "",
      suggestions: [],
      blocked: false,
      recognized: true,
    };
    res.status(200).json(result);
    return;
  }

  // Fast path: a name already known to fail copyright/trademark review (either a
  // prior Claude "warning" or a manual admin block — see src/utils/
  // characterBlocklist.ts) skips the Claude call entirely, so a repeat attempt gets
  // an instant, consistent block instead of another roll of a non-deterministic
  // classification. Also scrubs any leftover cache row, in case this name got
  // blocklisted by an admin without ever going through the Claude-driven scrub path.
  const blocklisted = await getBlocklistEntry(characterName);
  if (blocklisted) {
    await scrubCachedAvatar(characterName);
    void scrubUserBotsByName(characterName);
    // "content" (abusive name, or a living person with serious real-world legal
    // risk — see characterBlocklist.ts) is a hard, never-overridable block, same
    // shape as an abusive name caught fresh below. Legacy rows and "copyright" both
    // use the original overridable-if-caught-fresh scrub shape.
    const result: CharacterValidationResult =
      blocklisted.category === "content"
        ? {
            characterName,
            isPublicDomain: false,
            isSafe: false,
            warningLevel: "none",
            reason: CONTENT_BLOCKED_REASON,
            suggestions: [],
            blocked: true,
            recognized: true,
          }
        : {
            characterName,
            isPublicDomain: false,
            isSafe: false,
            warningLevel: "warning",
            reason: SCRUBBED_REASON,
            suggestions: [],
            blocked: false,
            recognized: true,
            scrubbed: true,
          };
    logEvent(
      "warn",
      "character_blocklist_hit",
      "Character name blocked via the persistent blocklist",
      sanitizeLogMeta({
        characterName,
        source: blocklisted.source,
        category: blocklisted.category,
      }),
    );
    void recordEvent("character_validated", {
      warningLevel: result.warningLevel,
      blocked: result.blocked,
      recognized: result.recognized,
      scrubbed: result.scrubbed ?? false,
    });
    res.status(200).json(result);
    return;
  }

  try {
    const model = getClaudeModel("text-simple");

    const response = await anthropic.messages.create({
      model,
      system: `You are a content-safety and copyright/trademark expert AI. Analyze character names for four, entirely separate concerns:

1. Abusive content: is the name itself profane, a slur or hate-speech term, sexually explicit, or otherwise abusive (in English or any other language, including l33tspeak/spacing tricks meant to evade filters)? This app publishes every created character's name and portrait on a public gallery page, so a name like this can never be allowed to exist, not just be flagged.
1b. Living-person legal/reputational risk (a second, independent way "blocked" can become true — a name can trigger 1, 1b, both, or neither): is this an identifiable REAL person who is CURRENTLY LIVING — never a historical or deceased figure, however controversial, and never a fictional character — who has a serious, well-documented real-world criminal conviction, or is the subject of extensive, credible, widely-reported allegations of serious criminal conduct (e.g. sexual assault, violent crime, major fraud)? This app publishes every created character's portrait and lets anyone chat with an AI "as" them, on a public gallery page — doing that for a living person with this kind of history creates real legal and reputational risk (right-of-publicity, defamation, false-endorsement concerns) for this app, independent of whether the name itself is profane.
   This bar is deliberately narrow — do NOT apply it to: any historical or deceased figure regardless of what they did (a historical dictator, conqueror, or slaveholder is not the same risk as impersonating someone alive today, and this app must not exclude legitimate historical figures); an ordinary living celebrity or politician with typical public controversy, disagreement, or a single unproven accusation; or any fictional character (a villain is a fictional character, not a real person).
   Worked example: "Bill Cosby" → blocked. A living person, the subject of extensive, credible, widely-reported allegations of sexual assault from dozens of individuals and a related criminal conviction.
   Counter-examples that do NOT meet this bar: any historical figure regardless of real-world actions (e.g. a historical conqueror or dictator — chatting about history is not the same exposure as impersonating someone alive today); a living public figure with ordinary political/celebrity controversy but no serious criminal conviction or extensive credible allegation of one.
2. Copyright/trademark status (entirely independent of concerns 1/1b — a name can be blocked for any combination of these, or none):
   - Publication/creation date (pre-1928 works are typically US public domain)
   - Trademark status (e.g., Disney characters, modern franchises)
   - Whether it's a historical figure vs fictional character
   - Active copyright protection
   - Critically: is this name itself only meaningful because of a specific corporate
     work (it has NO independent existence outside that franchise — Pikachu,
     Spider-Man, Elsa from Frozen), or is it a mythological deity, a historical
     person, or a character from a pre-1928 (or otherwise public-domain) work that a
     modern studio *also* happens to have adapted? A studio owning a popular
     adaptation of an ancient/historical/public-domain figure does NOT make that
     underlying name itself copyrighted or trademarked — only that studio's specific
     designs, dialogue, and likeness are protected. Chatting with a generically-drawn
     "Thor" or "Sherlock Holmes" or "Winnie-the-Pooh" is chatting with the
     underlying public-domain figure, not reproducing a specific studio's IP.
   Worked examples (do not deviate from these without a genuinely distinguishing fact):
   - "Thor" → none. A Norse mythological deity predating Marvel by centuries; Marvel's
     comics/film portrayal is a copyrighted adaptation, but the deity itself is not.
   - "Sherlock Holmes" → none. Most of the original Arthur Conan Doyle stories are
     confirmed US public domain (Klinger v. Conan Doyle Estate, 2014).
   - "Winnie-the-Pooh" → none. The original 1926 A.A. Milne book entered US public
     domain in January 2022; only Disney's specific character designs/branding
     remain trademarked, not the base literary character.
   - "Hercules"/"Zeus"/"Robin Hood"/"Beowulf" → none, same reasoning as "Thor": ancient
     mythology/folklore, independent of any modern studio's adaptation.
   - "Spider-Man"/"Pikachu"/"Elsa" (Frozen) → warning. These names have no meaning or
     prior existence outside their specific corporate origin.
3. Recognition (independent of all concerns above): is this an actual character or person you have real, specific knowledge of — a well-known (or even obscure but real) fictional character, historical figure, or mythological figure? Or does the name just look plausible without corresponding to anything you actually know (an invented name, a random combination of words, an original character)? Be honest here — do not guess or invent facts about a name just because it sounds like it could be a character.

Return ONLY valid JSON with this exact schema:
{
  "blocked": boolean,
  "isPublicDomain": boolean,
  "isSafe": boolean,
  "warningLevel": "none" | "caution" | "warning",
  "recognized": boolean,
  "reason": "Brief explanation (1-2 sentences)",
  "suggestions": ["alternative1", "alternative2", "alternative3"]
}

"blocked" guide:
- true: EITHER the name itself is profane, a slur, hate speech, sexually explicit, or otherwise abusive (concern 1), OR it identifies a real, currently-living person with a serious real-world criminal conviction or extensive credible allegations of serious criminal conduct (concern 1b) — either reason alone is enough.
- false: neither of the above — completely independent of whether it's copyrighted.

warningLevel guide (only about copyright/trademark, ignore concerns 1/1b entirely here):
- "none": Clearly public domain (historical figures, ancient mythology, pre-1928 classics,
  or a figure a studio merely also adapted — see the worked examples above), OR an
  unrecognized/original name (nothing to protect)
- "caution": Uncertain status or lesser-known character
- "warning": Clearly copyrighted/trademarked, and the name has NO meaning or origin
  independent of that specific corporate work (Disney, Marvel, modern franchises, etc.)

"recognized" guide:
- true: a real character or person you have specific knowledge about.
- false: an original/made-up name with no actual match — warningLevel should be "none" in this case, since there's nothing copyrighted about a name nobody has used.`,
      messages: [
        {
          role: "user",
          content: `Analyze this character name: "${characterName}"\n\nProvide validation result as JSON.`,
        },
      ],
      max_tokens: 350,
      temperature: 0,
    });

    const content = extractJson(
      response.content[0]?.type === "text" ? response.content[0].text : "{}",
    );
    const validation = JSON.parse(content);

    const result: CharacterValidationResult = {
      characterName,
      isPublicDomain: validation.isPublicDomain ?? true,
      isSafe: validation.isSafe ?? true,
      warningLevel: validation.warningLevel || "none",
      reason: validation.reason || "",
      suggestions: Array.isArray(validation.suggestions) ? validation.suggestions : [],
      blocked: validation.blocked === true,
      recognized: validation.recognized ?? true,
    };

    // A fresh "warning" goes on the blocklist immediately so every future attempt at
    // this name — by anyone — gets the fast, consistent block above instead of
    // another roll of this non-deterministic classification. Fire-and-forget: it only
    // affects future requests, so it shouldn't add latency to this one.
    //
    // A "warning" for a name that's already cached is an already-public character
    // whose copyright/trademark status just changed under re-classification.
    // Conservative by design: scrub it immediately and never offer "Continue Anyway"
    // for this case, rather than leaving a flagged name cached and publicly
    // displayed. A brand-new name failing for the first time (never cached) still
    // gets the ordinary overridable warning flow for *this* attempt — only a repeat
    // attempt against it will hit the blocklist fast path above.
    if (result.warningLevel === "warning") {
      void addToBlocklist(characterName, result.reason || null, "claude", "copyright");
      // Independent, append-only record of this event — see characterWarningLog.ts's
      // doc comment for why the (deduplicated) blocklist above can't serve as this
      // history once a name is later un-blocked or allowlisted.
      void logWarning(characterName, result.reason || null);
      const wasCached = await scrubCachedAvatar(characterName);
      void scrubUserBotsByName(characterName);
      if (wasCached) {
        result.scrubbed = true;
        result.reason = SCRUBBED_REASON;
        result.suggestions = [];
        logEvent(
          "warn",
          "character_scrubbed",
          "Previously-cached character removed after a warning-level re-validation",
          sanitizeLogMeta({ characterName }),
        );
      }
    }

    // A fresh `blocked: true` (abusive name, or a living person with serious
    // real-world legal risk — see the prompt's concern 1/1b above) also goes on the
    // blocklist immediately, same rationale as a copyright "warning" above: a repeat
    // attempt should get a fast, deterministic block instead of relying on this
    // non-deterministic classification catching it again every time. Scrubs both the
    // shared avatar cache and any user's own already-saved copy, in case this name
    // was created before this guardrail existed.
    if (result.blocked) {
      void addToBlocklist(characterName, result.reason || null, "claude", "content");
      void scrubCachedAvatar(characterName);
      void scrubUserBotsByName(characterName);
    }

    logEvent(
      "info",
      "character_validated",
      "Character validation completed",
      sanitizeLogMeta({
        characterName,
        isSafe: result.isSafe,
        warningLevel: result.warningLevel,
      }),
    );
    // Deliberately excludes characterName — this table is a small internal usage log, not
    // a place to accumulate user-supplied content (see src/db/schema.ts's analyticsEvents doc).
    void recordEvent("character_validated", {
      warningLevel: result.warningLevel,
      blocked: result.blocked,
      recognized: result.recognized,
      scrubbed: result.scrubbed ?? false,
    });

    res.status(200).json(result);
  } catch (err) {
    logEvent(
      "error",
      "character_validation_failed",
      "Failed to validate character",
      sanitizeLogMeta({
        characterName,
        error: err instanceof Error ? err.message : String(err),
      }),
    );

    // On error, default to safe (allow continuation but with caution)
    res.status(200).json({
      characterName,
      isPublicDomain: true,
      isSafe: true,
      warningLevel: "none",
      reason: "Unable to validate at this time. Please proceed with caution.",
      suggestions: [],
      blocked: false,
      recognized: true,
    } as CharacterValidationResult);
  }
}

#!/usr/bin/env node
/**
 * One-off, opt-in backfill that expands every existing recognized character to its
 * fullest commonly recognized name — first and last name at minimum when one genuinely
 * exists (e.g. "Einstein" -> "Albert Einstein"), the same expansion
 * pages/api/generate-personality.ts's `generatePersonalityPrompt` now performs at
 * creation time (see src/config/serverConfig.ts's `fullNameGuidance`). Without this,
 * only characters created after that change get the fuller name — this catches up
 * everything created before it.
 *
 * Touches two tables:
 *   1. `avatar_cache` (the public /chars gallery, global/shared) — both the lowercased
 *      `character_name` primary key AND `display_name` are renamed together, not just
 *      `display_name`. Renaming only the display name would leave the cache KEY short
 *      (e.g. "einstein"), so a future visitor typing "Albert Einstein" would miss the
 *      cache (its key would be "albert einstein") and generate a second, duplicate
 *      portrait for the same person — exactly the bug this backfill exists to prevent.
 *   2. `bots` (a signed-in user's own saved characters) — renamed to match, but ONLY
 *      when the bot's current name matches a name this script just confirmed above is a
 *      real, recognized character (i.e. it has a matching `avatar_cache` row with
 *      `recognized = true`). `bots` has no `recognized` flag of its own, so a user's
 *      original/invented character (never in avatar_cache by name) is never touched —
 *      expanding a made-up name risks Claude fabricating a surname for someone who was
 *      never real to begin with.
 *
 * Usage:
 *   node scripts/backfill-full-character-names.cjs [--dry-run]
 *   npm run chars:backfill-full-names -- --dry-run
 *
 * --dry-run prints every proposed change without writing anything. Its merge-collision
 * preview only reflects collisions that already exist in the DB at read time — it can't
 * predict a collision that would only arise from an earlier rename in the same dry run,
 * since nothing is actually written until a live run.
 *
 * Expands every recognized name in a single Claude call rather than batching — this
 * app's cached-character count is hobby-scale (same reasoning as
 * scrub-copyrighted-avatar-cache.cjs), so one prompt/response comfortably fits and it's
 * simpler than reconciling partial-batch failures.
 *
 * NOT run automatically — it costs one Claude call against shared production data,
 * same opt-in shape as this repo's other chars:* backfill scripts.
 *
 * Rollback story: every rename and merge is printed (old name/key -> new name/key)
 * before it happens, so the change is auditable from the script's own output. The one
 * lossy step is a merge collision (a short-named row and an already-existing
 * full-named row both refer to the same person): the shorter row is deleted, but its
 * avatarUrl/gender/category/displayName are printed first so it can be restored by hand
 * if ever needed. `bots` renames are plain field updates with no cascading effect
 * (messages are keyed by `bot_id`, not `name`) and can be reverted the same way — there
 * is no automatic undo.
 *
 * Known, self-healing edge case: an already-open browser session's localStorage still
 * holds the pre-backfill name until the user resumes that character via the "Resume"
 * dropdown (which reloads from GET /api/bots, picking up the new name) — until then it
 * behaves like a normal, un-renamed local session rather than losing any data, same
 * degrade-gracefully shape used elsewhere in this app when a client-held name doesn't
 * match a `bots` row.
 */

const { neon } = require("@neondatabase/serverless");
const Anthropic = require("@anthropic-ai/sdk").default;

// This runs as a standalone script, not through Next.js, so .env.local (which
// next dev/build load automatically) has to be loaded explicitly — same as
// drizzle.config.ts does for drizzle-kit.
require("dotenv").config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
const dryRun = process.argv.includes("--dry-run");

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL — refusing to run.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const anthropic = new Anthropic();

// Same tier used for the equivalent one-shot classification elsewhere in this repo's
// backfill scripts — a cheap, fast model is plenty for this.
const MODEL = "claude-haiku-4-5-20251001";

/**
 * Gets the fullest commonly recognized form of every name in a single Claude call —
 * mirrors src/config/serverConfig.ts's `fullNameGuidance` instruction (including its
 * four guardrails, all found live via this exact script's own dry-run output) so this
 * backfill and ordinary character creation stay consistent:
 *   - never fabricate a fuller form for a genuine mononym (e.g. "Zeus", "Gandalf");
 *   - only expand when it adds real, specific identifying information resolving to
 *     exactly one individual — never swap one vague epithet for another equally
 *     vague one (e.g. Frankenstein's deliberately unnamed creation: "the monster"
 *     must not become "the creature"), and never produce a title that's itself
 *     still ambiguous between multiple people (e.g. "Buckingham" must not become
 *     the still-ambiguous "Duke of Buckingham");
 *   - never swap a pen name/stage name/nickname that's ITSELF the more commonly
 *     recognized form for a less-recognized birth name (e.g. "Molière" must stay
 *     "Molière", not become "Jean-Baptiste Poquelin");
 *   - never guess when a bare name is genuinely ambiguous between two or more
 *     distinct, similarly well-known people (e.g. "Brutus" could be Caesar's
 *     assassin Marcus Junius Brutus, or the earlier Lucius Junius Brutus).
 */
async function expandAll(names) {
  // Generous headroom per entry (name + fullName, as JSON) so a large cache still
  // gets a complete response rather than a truncated one.
  const maxTokens = Math.min(64000, 500 + names.length * 80);

  const response = await anthropic.messages.create({
    model: MODEL,
    system: `You are a proofreader restoring the fullest commonly recognized name of a character or real/historical/mythological person. For each name, return its fullest known form — first and last name at minimum when the character genuinely has one (e.g. "einstein" -> "Albert Einstein", "napoleon" -> "Napoleon Bonaparte", "sherlock holmes" -> "Sherlock Holmes"), plus an honorific, regnal number, or suffix where that's genuinely how they're commonly identified (e.g. "richard iii" -> "Richard III"). Only expand when the result adds real, specific identifying information and resolves to exactly one well-known individual — never swap one vague descriptor or epithet for a different, equally vague one (e.g. do not turn "the monster" into "the creature": Frankenstein's creation is deliberately unnamed in the source material, so leave an epithet-only name exactly as given), and never produce a title that is itself still ambiguous between multiple people (e.g. "buckingham" should stay "Buckingham" rather than become the still-ambiguous "Duke of Buckingham" when multiple different Dukes of Buckingham exist). Never fabricate a surname or fuller form that isn't real and well-established — a figure genuinely known by a single name (e.g. "zeus", "gandalf") should keep just that name, properly capitalized. Do NOT replace a pen name, stage name, or nickname with a birth/legal name when the pen/stage name is itself the more commonly recognized form (e.g. "molière" stays "Molière", not "Jean-Baptiste Poquelin"; "mark twain" stays "Mark Twain", not "Samuel Clemens") — only expand toward MORE recognition, never toward less. If a name is genuinely ambiguous between two or more distinct, similarly well-known people or characters (e.g. "brutus" could mean either Caesar's assassin Marcus Junius Brutus or the earlier Lucius Junius Brutus) and nothing else here disambiguates it, return the input name unchanged rather than guessing. Preserve the identity exactly — never substitute a different character.

Return ONLY a valid JSON array, one entry per input name in the same order, each shaped {"name": string, "fullName": string}. No commentary.`,
    messages: [
      {
        role: "user",
        content: `Names:\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
      },
    ],
    max_tokens: maxTokens,
    temperature: 0,
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

/** Backfills avatar_cache, returning a Map of old lowercased key -> new full display name for every row actually (or, in --dry-run, would-be) changed. */
async function backfillAvatarCache() {
  const rows =
    await sql`SELECT character_name, display_name, avatar_url, gender, category FROM avatar_cache WHERE recognized = true ORDER BY character_name`;
  console.log(`Found ${rows.length} recognized cached character(s) to check.`);

  const renameMap = new Map();
  if (rows.length === 0) return renameMap;

  console.log(`Expanding all ${rows.length} name(s) in a single Claude call...`);
  let results;
  try {
    results = await expandAll(rows.map((r) => r.display_name || r.character_name));
  } catch (err) {
    console.error("Expansion call failed, aborting avatar_cache pass:", err.message || err);
    return renameMap;
  }

  let changed = 0;
  let merged = 0;

  for (const row of rows) {
    const inputName = row.display_name || row.character_name;
    const result = results.find(
      (r) => typeof r.name === "string" && r.name.toLowerCase() === inputName.toLowerCase(),
    );
    if (!result || typeof result.fullName !== "string" || !result.fullName.trim()) {
      console.warn(`  No expansion returned for "${inputName}", leaving unchanged.`);
      continue;
    }

    const newFullName = result.fullName.trim();
    const newKey = newFullName.toLowerCase();

    if (newKey === row.character_name) {
      // Key unchanged — at most a casing-only display-name refresh.
      if (row.display_name !== newFullName) {
        changed++;
        console.log(`  "${row.character_name}" display name -> "${newFullName}"`);
        if (!dryRun) {
          await sql`UPDATE avatar_cache SET display_name = ${newFullName} WHERE character_name = ${row.character_name}`;
        }
      }
      continue;
    }

    // The key itself is expanding (e.g. "einstein" -> "albert einstein") — check
    // whether a row already exists at the target key before renaming into it.
    const existingTarget =
      await sql`SELECT character_name FROM avatar_cache WHERE character_name = ${newKey}`;

    if (existingTarget.length > 0) {
      merged++;
      console.log(
        `  MERGE: "${row.character_name}" -> "${newKey}" (target already exists). Discarding source row (data below, for manual recovery if ever needed):`,
      );
      console.log(
        `    avatarUrl=${row.avatar_url ?? "(none)"} gender=${row.gender ?? "(none)"} category=${row.category ?? "(none)"} displayName=${row.display_name ?? "(none)"}`,
      );
      if (!dryRun) {
        await sql`DELETE FROM avatar_cache WHERE character_name = ${row.character_name}`;
      }
    } else {
      changed++;
      console.log(`  "${row.character_name}" -> "${newKey}" (display: "${newFullName}")`);
      if (!dryRun) {
        await sql`UPDATE avatar_cache SET character_name = ${newKey}, display_name = ${newFullName} WHERE character_name = ${row.character_name}`;
      }
    }

    renameMap.set(row.character_name, newFullName);
  }

  console.log(
    dryRun
      ? `avatar_cache dry run complete: ${changed} row(s) would change, ${merged} duplicate(s) would merge.`
      : `avatar_cache done: ${changed} row(s) updated, ${merged} duplicate(s) merged.`,
  );

  return renameMap;
}

/**
 * Mirrors avatar_cache's confirmed renames onto matching `bots` rows — never touches a
 * bot whose name isn't a name this run just confirmed is a real, recognized character.
 */
async function backfillBots(renameMap) {
  if (renameMap.size === 0) return;

  let changed = 0;
  let skipped = 0;

  for (const [oldKey, newFullName] of renameMap) {
    const botsRows =
      await sql`SELECT id, user_id, name, environment FROM bots WHERE lower(name) = ${oldKey}`;

    for (const bot of botsRows) {
      const conflict =
        await sql`SELECT id FROM bots WHERE user_id = ${bot.user_id} AND environment = ${bot.environment} AND name = ${newFullName}`;
      if (conflict.length > 0) {
        skipped++;
        console.warn(
          `  BOTS SKIP: user ${bot.user_id} already has a saved "${newFullName}" in ${bot.environment} — leaving bot ${bot.id} ("${bot.name}") as-is; merge manually if desired.`,
        );
        continue;
      }

      changed++;
      console.log(
        `  bots: "${bot.name}" -> "${newFullName}" (user ${bot.user_id}, ${bot.environment})`,
      );
      if (!dryRun) {
        await sql`UPDATE bots SET name = ${newFullName}, updated_at = now() WHERE id = ${bot.id}`;
      }
    }
  }

  console.log(
    dryRun
      ? `bots dry run complete: ${changed} saved character(s) would be renamed, ${skipped} skipped due to a conflict.`
      : `bots done: ${changed} saved character(s) renamed, ${skipped} skipped due to a conflict.`,
  );
}

async function main() {
  const renameMap = await backfillAvatarCache();
  await backfillBots(renameMap);
}

main().catch((err) => {
  console.error("Full-name backfill failed:", err);
  process.exit(1);
});

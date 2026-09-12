#!/usr/bin/env node
/**
 * One-off, opt-in backfill for the public /chars gallery and landing-page carousel:
 * fills in `avatar_cache.display_name` (see src/db/schema.ts) for rows written before
 * that column existed, via Claude — the same source of truth pages/api/generate-
 * avatar.ts now captures at write time (generate-personality's `correctedName`).
 *
 * Without this, an old row falls back to pages/api/chars.ts's regex-based
 * `toDisplayName` reconstruction, which is necessarily lossier than asking something
 * that actually knows the name — it can mis-capitalize a Roman numeral ("Richard Iii"),
 * a proper-noun exception, or any other case a generic word-capitalization heuristic
 * can't infer from the lowercased string alone.
 *
 * NOT run automatically — it costs one Claude call per batch of names against a
 * shared production table. Run it yourself when you want that historical cleanup:
 *
 *   node scripts/backfill-avatar-display-names.cjs [--dry-run]
 *
 * --dry-run prints what would change without writing anything.
 *
 * Non-destructive: only ever sets `display_name` on rows where it's currently NULL —
 * never touches `character_name` (the primary key) or any other column.
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

// Same tier used for the equivalent one-shot classification in
// pages/api/validate-character.ts — a cheap, fast model is plenty for this.
const MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 25;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Gets the properly-cased display form of a batch of lowercased names in one Claude call. */
async function formatBatch(names) {
  const response = await anthropic.messages.create({
    model: MODEL,
    system: `You are a proofreader restoring correct capitalization to lowercased names of characters and real or historical people. For each name, return its properly-cased display form (e.g. "richard iii" -> "Richard III", "vincent van gogh" -> "Vincent van Gogh", "joan of arc" -> "Joan of Arc"). Preserve the original word order and spelling exactly — only fix casing.

Return ONLY a valid JSON array, one entry per input name in the same order, each shaped {"name": string, "displayName": string}. No commentary.`,
    messages: [
      {
        role: "user",
        content: `Names:\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
      },
    ],
    max_tokens: 1000,
    temperature: 0,
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

async function main() {
  const rows =
    await sql`SELECT character_name FROM avatar_cache WHERE display_name IS NULL ORDER BY character_name`;
  console.log(`Found ${rows.length} cached character(s) missing a display name.`);
  if (rows.length === 0) return;

  const batches = chunk(rows, BATCH_SIZE);
  let changed = 0;

  for (const [i, batch] of batches.entries()) {
    console.log(`Formatting batch ${i + 1}/${batches.length} (${batch.length} names)...`);
    let results;
    try {
      results = await formatBatch(batch.map((r) => r.character_name));
    } catch (err) {
      console.error(`  Batch ${i + 1} failed, skipping:`, err.message || err);
      continue;
    }

    for (const row of batch) {
      const result = results.find(
        (r) =>
          typeof r.name === "string" && r.name.toLowerCase() === row.character_name.toLowerCase(),
      );
      if (!result || typeof result.displayName !== "string" || !result.displayName.trim()) {
        console.warn(`  No display name returned for "${row.character_name}", leaving unchanged.`);
        continue;
      }

      changed++;
      console.log(`  "${row.character_name}" -> "${result.displayName}"`);
      if (!dryRun) {
        await sql`UPDATE avatar_cache SET display_name = ${result.displayName} WHERE character_name = ${row.character_name}`;
      }
    }
  }

  console.log(
    dryRun
      ? `Dry run complete: ${changed} row(s) would change.`
      : `Done: ${changed} row(s) updated.`,
  );
}

main().catch((err) => {
  console.error("Display-name backfill failed:", err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Opt-in category backfill for existing recognized avatar_cache rows.
 *
 * Usage:
 *   npm run chars:backfill-categories -- --dry-run
 *   npm run chars:backfill-categories
 *
 * The dry run performs classification and prints proposed changes without writing.
 * The live run only fills NULL category values and never changes names or portraits.
 */

const { neon } = require("@neondatabase/serverless");
const Anthropic = require("@anthropic-ai/sdk").default;

require("dotenv").config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
const dryRun = process.argv.includes("--dry-run");
const MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 25;
const CATEGORIES = new Set(["history", "mythology", "literature", "folklore", "religion", "other"]);

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL — refusing to run.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const anthropic = new Anthropic();

/** Splits an array into bounded batches for one structured model request each. */
function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/** Classifies a batch of names into the Character Wall's stable taxonomy. */
async function classifyBatch(names) {
  const response = await anthropic.messages.create({
    model: MODEL,
    system: `Classify each named person or character into exactly one category:
- history: real historical people, including rulers, scientists, artists, writers, and political figures
- mythology: named figures from a culture's mythology or ancient epic tradition
- literature: characters originating in a named written work
- folklore: fairy-tale, legendary, or oral-tradition figures without one defining authored work
- religion: religious figures, saints, theologians, and philosophers best known for a school of thought
- other: only when none of the above fits

Return ONLY a valid JSON array in input order, shaped {"name": string, "category": string}.`,
    messages: [{ role: "user", content: `Names:\n${names.join("\n")}` }],
    max_tokens: 1200,
    temperature: 0,
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

/** Runs the opt-in category backfill. */
async function main() {
  const rows = await sql`
    SELECT character_name, display_name
    FROM avatar_cache
    WHERE recognized = true AND category IS NULL
    ORDER BY character_name
  `;
  console.log(`Found ${rows.length} recognized portrait(s) missing a category.`);
  if (rows.length === 0) return;

  let changed = 0;
  const batches = chunk(rows, BATCH_SIZE);
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`Classifying batch ${batchIndex + 1}/${batches.length} (${batch.length} names)...`);
    let results;
    try {
      results = await classifyBatch(batch.map((row) => row.display_name || row.character_name));
    } catch (error) {
      console.error(`  Batch ${batchIndex + 1} failed, skipping:`, error.message || error);
      continue;
    }

    for (const [index, row] of batch.entries()) {
      const result = results[index];
      if (!result || !CATEGORIES.has(result.category)) {
        console.warn(
          `  Invalid category for "${row.display_name || row.character_name}", skipping.`,
        );
        continue;
      }

      changed += 1;
      console.log(`  ${row.display_name || row.character_name} -> ${result.category}`);
      if (!dryRun) {
        await sql`
          UPDATE avatar_cache
          SET category = ${result.category}
          WHERE character_name = ${row.character_name} AND category IS NULL
        `;
      }
    }
  }

  console.log(
    dryRun
      ? `Dry run complete: ${changed} row(s) would change.`
      : `Done: ${changed} row(s) updated.`,
  );
}

main().catch((error) => {
  console.error("Category backfill failed:", error);
  process.exit(1);
});

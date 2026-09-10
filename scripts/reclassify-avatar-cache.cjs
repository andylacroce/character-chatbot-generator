#!/usr/bin/env node
/**
 * One-off, opt-in cleanup for the public /chars gallery: re-classifies every
 * existing avatar_cache row's `recognized` flag (see src/db/schema.ts) via Claude,
 * so an original/made-up character created before that column existed (when every
 * generated avatar was cached and shown publicly, regardless of whether it was an
 * actual character or an invented name) gets excluded from the gallery too, not
 * just avatars generated going forward.
 *
 * NOT run automatically — it costs one Claude call per batch of names against a
 * shared production table, and it changes what's publicly visible on /chars. Run it
 * yourself when you want that historical cleanup:
 *
 *   node scripts/reclassify-avatar-cache.cjs [--dry-run]
 *
 * --dry-run prints what would change without writing anything.
 *
 * Non-destructive either way: rows are never deleted, only their `recognized` flag
 * is updated, so a bad classification is trivially reversible (re-run, or flip the
 * flag back by hand).
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

/** Classifies a batch of names in one Claude call to keep this cheap and fast. */
async function classifyBatch(names) {
  const response = await anthropic.messages.create({
    model: MODEL,
    system: `You are a character-recognition expert. For each character name, decide whether it is an actual character or person you have real, specific knowledge of — a well-known (or even obscure but real) fictional character, historical figure, or mythological figure — or whether it just looks like a plausible name without corresponding to anything you actually know (an invented name, an original character). Be honest: do not guess or invent facts about a name just because it sounds like it could be a character.

Return ONLY a valid JSON array, one entry per input name in the same order, each shaped {"name": string, "recognized": boolean}. No commentary.`,
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
    await sql`SELECT character_name, recognized FROM avatar_cache ORDER BY character_name`;
  console.log(`Found ${rows.length} cached character(s).`);
  if (rows.length === 0) return;

  const batches = chunk(rows, BATCH_SIZE);
  let changed = 0;

  for (const [i, batch] of batches.entries()) {
    console.log(`Classifying batch ${i + 1}/${batches.length} (${batch.length} names)...`);
    let results;
    try {
      results = await classifyBatch(batch.map((r) => r.character_name));
    } catch (err) {
      console.error(`  Batch ${i + 1} failed, skipping:`, err.message || err);
      continue;
    }

    for (const row of batch) {
      const result = results.find(
        (r) =>
          typeof r.name === "string" && r.name.toLowerCase() === row.character_name.toLowerCase(),
      );
      if (!result || typeof result.recognized !== "boolean") {
        console.warn(
          `  No classification returned for "${row.character_name}", leaving unchanged.`,
        );
        continue;
      }
      if (result.recognized === row.recognized) continue;

      changed++;
      console.log(
        `  "${row.character_name}": recognized ${row.recognized} -> ${result.recognized}`,
      );
      if (!dryRun) {
        await sql`UPDATE avatar_cache SET recognized = ${result.recognized} WHERE character_name = ${row.character_name}`;
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
  console.error("Reclassification failed:", err);
  process.exit(1);
});

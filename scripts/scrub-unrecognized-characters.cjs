#!/usr/bin/env node
/**
 * One-time retirement cleanup for original/invented characters.
 *
 * Deletes every legacy `avatar_cache` row already classified `recognized = false`,
 * plus any saved `bots` row with the same case-insensitive name. Bot message history
 * cascades through its foreign key. This deliberately does not infer from a cache miss:
 * an established character can lack a cache row after a provider/storage failure.
 *
 * Usage:
 *   npm run chars:scrub-unrecognized -- --dry-run
 *   npm run chars:scrub-unrecognized
 */

const { neon } = require("@neondatabase/serverless");
const { del } = require("@vercel/blob");
const Anthropic = require("@anthropic-ai/sdk").default;

require("dotenv").config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
const blobToken = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
const dryRun = process.argv.includes("--dry-run");

if (!databaseUrl) {
  console.error("Missing DATABASE_URL — refusing to run.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const anthropic = new Anthropic();
const model = "claude-haiku-4-5-20251001";
const batchSize = 25;

/** Finds only names that are unambiguously invented, preserving every uncertain case. */
async function classify(names) {
  const response = await anthropic.messages.create({
    model,
    system: `You are performing a destructive-data safety review. Identify ONLY names that are unambiguously invented/original and have no plausible established referent.

Preserve a name whenever it could identify an established fictional character, historical person, mythological or religious figure, or documented folklore/legend figure. Be deliberately conservative: shortened names ("Sherlock"), titles or surnames ("Buckingham"), translated/common labels ("Beauty"), epithets ("The Monster"), and obscure or supporting characters ("Charles Bovary") must be preserved when they have a plausible established referent. Uncertainty always means preserve. Set invented=true only when you are highly confident the name is an original creation, random combination, or nonsense and cannot identify any established figure. Do not treat unfamiliarity alone as evidence that a name is invented.

Return ONLY a valid JSON array, one entry per input in the same order, shaped {"name": string, "invented": boolean, "reason": string}.`,
    messages: [
      {
        role: "user",
        content: `Names:\n${names.map((name, i) => `${i + 1}. ${name}`).join("\n")}`,
      },
    ],
    max_tokens: 1200,
    temperature: 0,
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";
  const match = text.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

/** Deletes an unreferenced Vercel Blob URL after its database rows are gone. */
async function deleteBlobIfUnreferenced(url) {
  if (!blobToken || !/^https:\/\/.+\.blob\.vercel-storage\.com\//.test(url)) return false;
  const cacheRefs = await sql`SELECT 1 FROM avatar_cache WHERE avatar_url = ${url} LIMIT 1`;
  const botRefs = await sql`SELECT 1 FROM bots WHERE avatar_url = ${url} LIMIT 1`;
  if (cacheRefs.length || botRefs.length) return false;
  await del(url, { token: blobToken });
  return true;
}

/** Runs the retirement scrub against the configured database. */
async function main() {
  const rows = await sql`
    SELECT character_name, display_name, avatar_url
    FROM avatar_cache
    ORDER BY character_name
  `;
  console.log(`Classifying ${rows.length} cached character(s).`);

  const targets = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const results = await classify(batch.map((row) => row.display_name || row.character_name));
    for (let index = 0; index < batch.length; index++) {
      if (results[index]?.invented === true) targets.push(batch[index]);
    }
  }
  console.log(`Found ${targets.length} unrecognized cached character(s).`);

  let botCount = 0;
  let blobCount = 0;
  for (const row of targets) {
    const bots = await sql`
      SELECT id, name, environment, avatar_url
      FROM bots
      WHERE lower(name) = lower(${row.character_name})
    `;
    botCount += bots.length;
    console.log(
      `${dryRun ? "[dry run] would remove" : "Removing"} "${row.display_name || row.character_name}" ` +
        `(${bots.length} saved bot${bots.length === 1 ? "" : "s"})`,
    );
    if (dryRun) continue;

    await sql`DELETE FROM bots WHERE lower(name) = lower(${row.character_name})`;
    await sql`DELETE FROM avatar_cache WHERE character_name = ${row.character_name}`;

    const urls = new Set([row.avatar_url, ...bots.map((bot) => bot.avatar_url)].filter(Boolean));
    for (const url of urls) {
      if (await deleteBlobIfUnreferenced(url)) blobCount++;
    }
  }

  console.log(
    dryRun
      ? `Dry run complete: ${targets.length} cache row(s) and ${botCount} saved bot(s) would be removed.`
      : `Done: removed ${targets.length} cache row(s), ${botCount} saved bot(s), and ${blobCount} unreferenced Blob object(s).`,
  );
}

main().catch((err) => {
  console.error("Unrecognized-character scrub failed:", err);
  process.exit(1);
});

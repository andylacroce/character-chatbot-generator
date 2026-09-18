#!/usr/bin/env node
/**
 * One-off, opt-in copyright/trademark sweep over every existing avatar_cache row.
 *
 * pages/api/validate-character.ts's live re-check only ever catches a name the
 * moment a guest/user happens to launch it again (see its blocklist-fast-path and
 * "already cached + warning" scrub path — src/utils/characterBlocklist.ts); a name
 * nobody has re-launched since being cached could sit on the public Character
 * Wall/carousel indefinitely even if it would score a "warning" today. This script
 * re-runs that same warningLevel classification over every cached name in one pass,
 * adds any "warning" result to the persistent blocklist (same table the live
 * endpoint checks, so it's protected going forward too, not just this once), and
 * deletes it from avatar_cache — same threshold, same conservative "just scrub it"
 * behavior, applied retroactively.
 *
 * Classifies every cached name in a single Claude call rather than batching — this
 * app's cached-character count is hobby-scale, so one prompt/response comfortably
 * fits, and it's simpler than reconciling partial-batch failures.
 *
 * NOT run automatically — it costs one Claude call against a shared production
 * table, and it deletes rows (irreversible: a scrubbed name's avatar/personality
 * would have to be regenerated from scratch if ever re-created, though it would
 * immediately re-fail via the blocklist unless an admin un-blocks it first). Run it
 * yourself:
 *
 *   node scripts/scrub-copyrighted-avatar-cache.cjs [--dry-run]
 *
 * --dry-run prints what would be blocklisted/deleted without touching the table.
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

/** Classifies every name's copyright/trademark status in a single Claude call. */
async function classifyAll(names) {
  // Generous headroom per entry (name + warningLevel + a short reason, as JSON) so a
  // large cache still gets a complete response rather than a truncated one.
  const maxTokens = Math.min(64000, 500 + names.length * 80);

  const response = await anthropic.messages.create({
    model: MODEL,
    system: `You are a copyright/trademark expert AI. For each character name, classify its copyright/trademark status, considering:
- Publication/creation date (pre-1928 works are typically US public domain)
- Trademark status (e.g., Disney characters, modern franchises)
- Whether it's a historical figure vs fictional character
- Active copyright protection

Return ONLY a valid JSON array, one entry per input name in the same order, each shaped {"name": string, "warningLevel": "none" | "caution" | "warning", "reason": string}. "reason" is a brief (1 sentence) explanation, only meaningful when warningLevel is "warning". No commentary outside the JSON array.

warningLevel guide:
- "none": Clearly public domain (historical figures, ancient mythology, pre-1928 classics), OR an unrecognized/original name (nothing to protect)
- "caution": Uncertain status or lesser-known character
- "warning": Clearly copyrighted/trademarked (Disney, Marvel, modern franchises, etc.)`,
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

async function main() {
  const rows = await sql`SELECT character_name FROM avatar_cache ORDER BY character_name`;
  console.log(`Found ${rows.length} cached character(s).`);
  if (rows.length === 0) return;

  console.log(`Classifying all ${rows.length} name(s) in a single Claude call...`);
  const results = await classifyAll(rows.map((r) => r.character_name));

  const flagged = [];
  for (const row of rows) {
    const result = results.find(
      (r) =>
        typeof r.name === "string" && r.name.toLowerCase() === row.character_name.toLowerCase(),
    );
    if (!result || typeof result.warningLevel !== "string") {
      console.warn(`  No classification returned for "${row.character_name}", leaving unchanged.`);
      continue;
    }
    if (result.warningLevel !== "warning") continue;

    const reason = typeof result.reason === "string" ? result.reason : null;
    flagged.push({ name: row.character_name, reason });
    console.log(
      `  "${row.character_name}": flagged (warningLevel: warning) — ${reason ?? "(no reason given)"}`,
    );

    if (!dryRun) {
      await sql`
        INSERT INTO character_blocklist (character_name, display_name, reason, source)
        VALUES (${row.character_name}, ${row.character_name}, ${reason}, 'claude')
        ON CONFLICT (character_name) DO UPDATE SET reason = EXCLUDED.reason, source = EXCLUDED.source
      `;
      await sql`DELETE FROM avatar_cache WHERE character_name = ${row.character_name}`;
    }
  }

  console.log(
    dryRun
      ? `Dry run complete: ${flagged.length} row(s) would be blocklisted and deleted.`
      : `Done: ${flagged.length} row(s) blocklisted and deleted.`,
  );
  if (flagged.length > 0) {
    console.log(flagged.map((f) => `  - ${f.name}`).join("\n"));
  }
}

main().catch((err) => {
  console.error("Copyright scrub failed:", err);
  process.exit(1);
});

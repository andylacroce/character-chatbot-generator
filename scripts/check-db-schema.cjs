#!/usr/bin/env node
/**
 * Read-only guardrail against the "edited src/db/schema.ts, forgot npm run db:push"
 * failure mode that has broken live dev/prod twice (missing `preferred_name`, then
 * missing `display_name` — see this repo's own git history and Claude memory for both
 * incidents). Never mutates anything: it only compares the column names declared in
 * schema.ts against what `information_schema.columns` reports for the same tables in
 * the actual database, and prints a loud warning (never throws, never exits non-zero)
 * if schema.ts has columns the live DB doesn't.
 *
 * Wired into both `predev` and `npm run ci` so it surfaces automatically at exactly the
 * two moments those prior incidents actually happened: starting `next dev` locally, and
 * running the composite `ci` gate before calling work done. Exits non-zero on drift so
 * neither one can be scrolled past as a warning. Silently no-ops without DATABASE_URL —
 * this is also what makes it a no-op on GitHub Actions CI, which has no DB credentials
 * at all; it only has teeth where a real DATABASE_URL is configured (local dev/.env.local),
 * same degrade-gracefully shape as every other optional DB-dependent feature in this app.
 *
 * Deliberately a regex scan of schema.ts rather than importing it: this runs as a
 * plain Node script (like the other one-off scripts here), and schema.ts is TypeScript
 * with no build step available at this point in `predev`.
 */

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

require("dotenv").config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  process.exit(0);
}

const schemaPath = path.join(__dirname, "..", "src", "db", "schema.ts");
const schemaSource = fs.readFileSync(schemaPath, "utf8");

/** Extracts { tableName -> Set<columnName> } declared in schema.ts's pgTable(...) calls. */
function extractDeclaredSchema(source) {
  const tables = {};
  const tableRegex = /pgTable\(\s*"([a-zA-Z0-9_]+)"\s*,\s*\{/g;
  let match;
  while ((match = tableRegex.exec(source))) {
    const tableName = match[1];
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    const body = source.slice(bodyStart, i - 1);
    const columns = new Set();
    const columnRegex = /[a-zA-Z0-9_]+\s*:\s*[a-zA-Z0-9_]+\(\s*"([a-zA-Z0-9_]+)"/g;
    let colMatch;
    while ((colMatch = columnRegex.exec(body))) {
      columns.add(colMatch[1]);
    }
    tables[tableName] = columns;
  }
  return tables;
}

async function main() {
  const declared = extractDeclaredSchema(schemaSource);
  const sql = neon(DATABASE_URL);
  const missing = [];

  for (const [table, columns] of Object.entries(declared)) {
    let liveColumns;
    try {
      const rows = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
      `;
      liveColumns = new Set(rows.map((r) => r.column_name));
    } catch {
      // Can't reach the DB at all — not this script's job to report connectivity issues.
      return;
    }
    if (liveColumns.size === 0) continue; // table doesn't exist yet: not a drift concern here

    for (const column of columns) {
      if (!liveColumns.has(column)) missing.push(`${table}.${column}`);
    }
  }

  if (missing.length > 0) {
    console.error(
      `\n⚠️  DB schema drift: src/db/schema.ts declares column(s) not present in the ` +
        `live database:\n   ${missing.join(", ")}\n   Run \`npm run db:push\` to apply ` +
        `them before relying on the affected feature(s).\n`,
    );
    process.exitCode = 1;
  }
}

main().catch(() => {
  // A failure here (bad query, network blip) isn't itself schema drift — don't block
  // `npm run dev`/`npm run ci` over a connectivity problem this script didn't cause.
});

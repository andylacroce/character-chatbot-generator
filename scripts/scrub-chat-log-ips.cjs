#!/usr/bin/env node
/**
 * One-off, opt-in cleanup: removes the IP address from every existing chat
 * troubleshooting log in Vercel Blob. pages/api/log-message.ts used to write lines as
 * `[timestamp] [ip] sender: text`; it now writes `[timestamp] sender: text`, since an IP
 * ties an otherwise-anonymous guest log to a real person. This rewrites older logs into
 * the new shape, keeping the messages themselves.
 *
 * NOT run automatically — it rewrites shared production data. Run it yourself:
 *
 *   node scripts/scrub-chat-log-ips.cjs [--dry-run]
 *
 * --dry-run reports which logs contain IPs without writing anything.
 */

const { list, put } = require("@vercel/blob");

require("dotenv").config({ path: ".env.local" });

const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
const dryRun = process.argv.includes("--dry-run");

if (!token) {
  console.error("Missing VERCEL_BLOB_READ_WRITE_TOKEN/BLOB_READ_WRITE_TOKEN — refusing to run.");
  process.exit(1);
}

// `[2026-09-24T10:00:00.000Z] [203.0.113.7] ` -> `[2026-09-24T10:00:00.000Z] `
// Only IP-shaped values (or the old "UnknownIP" placeholder) match, so message text
// that happens to start with a bracket is never touched.
const IP_FIELD = /^(\[[^\]\n]+\]) \[(?:[0-9A-Fa-f.:]+|UnknownIP)\] /gm;

async function main() {
  let scanned = 0;
  let scrubbed = 0;
  let cursor;
  do {
    const page = await list({ cursor, token });
    for (const blob of page.blobs) {
      if (!blob.pathname.endsWith(".log")) continue;
      scanned++;
      const response = await fetch(`${blob.url}?cachebust=${Date.now()}`);
      if (!response.ok) {
        console.error(`Skipping ${blob.pathname}: HTTP ${response.status}`);
        continue;
      }
      const content = await response.text();
      const cleaned = content.replace(IP_FIELD, "$1 ");
      if (cleaned === content) continue;
      scrubbed++;
      console.log(`${dryRun ? "[dry run] would scrub" : "Scrubbing"} ${blob.pathname}`);
      if (!dryRun) {
        await put(blob.pathname, cleaned, {
          access: "public",
          allowOverwrite: true,
          addRandomSuffix: false,
          token,
        });
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  console.log(`Scanned ${scanned} log(s); ${dryRun ? "would scrub" : "scrubbed"} ${scrubbed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

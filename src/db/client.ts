/**
 * Lazily-constructed Drizzle client over Neon's HTTP driver.
 * Never connects at module import time (matters for `next build`, which never
 * executes API route handlers but does bundle them) — the client is only built
 * on first real use, and only if DATABASE_URL is configured.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | undefined;

/** Returns the shared Drizzle client, throwing if DATABASE_URL isn't configured. */
export function getDb(): Db {
  if (!cached) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DATABASE_URL");
    }
    cached = drizzle(neon(connectionString), { schema });
  }
  return cached;
}

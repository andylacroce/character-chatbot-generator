/**
 * Resolves the current deployment environment for scoping per-environment DB rows
 * (e.g. `bots.environment`) — one shared database, walled off by this column rather
 * than separate Neon branches per environment. `VERCEL_ENV` is set by Vercel itself
 * ("production" | "preview" | "development") and is never client-controlled; local
 * `next dev` doesn't set it at all, so it falls back to "development" there too.
 */
export function getCurrentEnvironment(): string {
  return process.env.VERCEL_ENV ?? "development";
}

/**
 * Shared wrapper for the `/api/[game]/*` routes: resolves the `[game]` path segment to a game
 * definition (404 for anything that isn't one), applies that game's own per-endpoint rate
 * limiter, and adds the request log. Each route file then holds the one implementation of its
 * endpoint for both guessing games.
 */

import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit, createRateLimiter } from "../rateLimit";
import { withRequestLog } from "../withRequestLog";
import { getServerGame, type ServerGame } from "./definitions";

type RateLimiter = ReturnType<typeof createRateLimiter>;

/** Limiters are created once per game+endpoint, so each keeps its own counter (`rl:<name>:<ip>`). */
const limiters = new Map<string, RateLimiter>();

/** Returns the (cached) limiter named `<slug>-<endpoint>`, matching the names used before routes were shared. */
function limiterFor(game: ServerGame, endpoint: string, max: number, message: string) {
  const name = `${game.slug}-${endpoint}`;
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = createRateLimiter({ name, max, message });
    limiters.set(name, limiter);
  }
  return limiter;
}

export interface GameRouteOptions {
  /** The endpoint's own name, e.g. `message`; part of the rate limiter's name. */
  endpoint: string;
  max: number;
  message?: string;
}

const DEFAULT_LIMIT_MESSAGE = "Too many game requests from this IP, please try again later.";

/** Wraps a per-game handler as a Next.js route: game lookup, rate limit, request log. */
export function gameRoute(
  { endpoint, max, message = DEFAULT_LIMIT_MESSAGE }: GameRouteOptions,
  handler: (game: ServerGame, req: NextApiRequest, res: NextApiResponse) => Promise<void>,
): NextApiHandler {
  return withRequestLog(async (req, res) => {
    const game = getServerGame(req.query.game);
    if (!game) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!(await applyRateLimit(limiterFor(game, endpoint, max, message), req, res))) return;
    await handler(game, req, res);
  });
}

/** Sends 405 (and returns true) unless the request uses one of `methods`. */
export function rejectMethod(
  req: NextApiRequest,
  res: NextApiResponse,
  methods: string[],
): boolean {
  if (req.method && methods.includes(req.method)) return false;
  res.setHeader("Allow", methods);
  res.status(405).end(`Method ${req.method} Not Allowed`);
  return true;
}

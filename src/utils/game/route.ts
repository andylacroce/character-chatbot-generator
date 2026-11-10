/**
 * Shared wrapper for the `/api/[game]/*` routes: resolves the `[game]` path segment to a game
 * definition (404 for anything that isn't one) and applies that game's own per-endpoint rate
 * limit and request log. Each route file then holds the one implementation of its endpoint for
 * both guessing games.
 */

import type { NextRequest } from "next/server";
import { withRoute } from "../server/withRoute";
import { getServerGame, type ServerGame } from "./definitions";

export interface GameRouteOptions {
  /** The endpoint's own name, e.g. `message`; part of the rate limiter's name. */
  endpoint: string;
  max: number;
  message?: string;
}

const DEFAULT_LIMIT_MESSAGE = "Too many game requests from this IP, please try again later.";

/** Wraps a per-game handler as a route: game lookup, per-game rate limit, request log. */
export function gameRoute(
  { endpoint, max, message = DEFAULT_LIMIT_MESSAGE }: GameRouteOptions,
  handler: (game: ServerGame, req: NextRequest) => Promise<Response>,
) {
  // One wrapped handler per game, so each keeps its own counter (`rl:<slug>-<endpoint>:<ip>`).
  const wrapped = new Map<string, ReturnType<typeof withRoute>>();
  return async (req: NextRequest, ctx: { params: Promise<{ game: string }> }) => {
    const game = getServerGame((await ctx.params).game);
    if (!game) return Response.json({ error: "Not found" }, { status: 404 });
    let route = wrapped.get(game.slug);
    if (!route) {
      route = withRoute({ name: `${game.slug}-${endpoint}`, max, message }, (r) =>
        handler(game, r),
      );
      wrapped.set(game.slug, route);
    }
    return route(req);
  };
}

import type { MetadataRoute } from "next";
// Deep imports, not the package root: the root re-exports React hooks, which a Server Component bundle rejects.
import { characterSlug } from "character-chatbot-shared/src/validation";
import { getAllCharacters } from "../utils/charactersWall";
import { SITE_URL } from "../utils/site";

// Read the Wall per request: a build-time snapshot would miss every character created afterward.
export const dynamic = "force-dynamic";

const STATIC_PATHS = [
  "",
  "/characters",
  "/guess-who",
  "/guess-who-next",
  "/leaderboard",
  "/privacy",
];

/** The public pages plus one entry per Wall character (static pages only when the database is unavailable). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
  try {
    for (const character of await getAllCharacters()) {
      const slug = characterSlug(character.name);
      if (slug) {
        entries.push({
          url: `${SITE_URL}/characters/${slug}`,
          lastModified: new Date(character.createdAtMs),
        });
      }
    }
  } catch {
    // No database (or a read failure): the static pages alone are still a valid sitemap.
  }
  return entries;
}

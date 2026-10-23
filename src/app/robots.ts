import type { MetadataRoute } from "next";
import { SITE_URL } from "../utils/site";

/** Lets crawlers index the public pages and keeps them out of the API, admin, and account areas. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/history", "/auth/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

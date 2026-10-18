const mockGetAllCharacters = jest.fn();
jest.mock("../../src/utils/charactersWall", () => ({
  getAllCharacters: () => mockGetAllCharacters(),
}));

import robots from "../../src/app/robots";
import sitemap from "../../src/app/sitemap";

const ORIGIN = "https://character-chatbot-generator.vercel.app";

describe("robots", () => {
  it("allows the site, hides private areas, and points at the sitemap", () => {
    const result = robots();

    expect(result.sitemap).toBe(`${ORIGIN}/sitemap.xml`);
    expect(result.rules).toMatchObject({ allow: "/" });
    expect((result.rules as { disallow: string[] }).disallow).toEqual(
      expect.arrayContaining(["/api/", "/admin", "/history", "/auth/"]),
    );
  });
});

describe("sitemap", () => {
  beforeEach(() => mockGetAllCharacters.mockReset());

  it("lists the static pages and a page per slug-able character", async () => {
    mockGetAllCharacters.mockResolvedValue([
      { name: "Joan of Arc", createdAtMs: 1000 },
      { name: "孔子", createdAtMs: 2000 },
    ]);

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toEqual(
      expect.arrayContaining([`${ORIGIN}`, `${ORIGIN}/chars`, `${ORIGIN}/guess-who`]),
    );
    expect(urls).toContain(`${ORIGIN}/chars/joan-of-arc`);
    expect(urls.filter((u) => u.includes("/chars/"))).toHaveLength(1);
  });

  it("dates a character entry by when it was created", async () => {
    mockGetAllCharacters.mockResolvedValue([{ name: "Joan of Arc", createdAtMs: 1000 }]);

    const entry = (await sitemap()).find((e) => e.url.endsWith("/joan-of-arc"));

    expect(entry?.lastModified).toEqual(new Date(1000));
  });

  it("falls back to the static pages when the database read fails", async () => {
    mockGetAllCharacters.mockRejectedValue(new Error("no database"));

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toHaveLength(6);
    expect(urls.some((u) => u.includes("/chars/"))).toBe(false);
  });
});

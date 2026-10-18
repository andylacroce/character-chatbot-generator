const mockRows = jest.fn();
jest.mock("../../src/db/client", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ orderBy: () => mockRows() }) }) }),
}));

import {
  clearCharactersCache,
  getAllCharacters,
  getCharacterBySlug,
} from "../../src/utils/charactersWall";

const row = (characterName: string, displayName: string | null = null, createdAt = 1) => ({
  characterName,
  displayName,
  avatarUrl: `https://blob.example.com/${characterName}.png`,
  category: "history",
  createdAt: new Date(createdAt),
});

beforeEach(() => {
  clearCharactersCache();
  mockRows.mockReset();
});

describe("getCharacterBySlug", () => {
  it("finds a character by the slug of its display name", async () => {
    mockRows.mockResolvedValue([row("sherlock holmes"), row("joan of arc", "Joan of Arc")]);

    await expect(getCharacterBySlug("joan-of-arc")).resolves.toMatchObject({
      name: "Joan of Arc",
      category: "history",
    });
  });

  it("falls back to the formatted stored name when no display name was saved", async () => {
    mockRows.mockResolvedValue([row("catherine de medici")]);

    await expect(getCharacterBySlug("catherine-de-medici")).resolves.toMatchObject({
      name: "Catherine de Medici",
    });
  });

  it("returns null for an unknown or empty slug without reading the database for the empty one", async () => {
    mockRows.mockResolvedValue([row("sherlock holmes")]);

    await expect(getCharacterBySlug("nobody")).resolves.toBeNull();
    mockRows.mockClear();
    await expect(getCharacterBySlug("")).resolves.toBeNull();
    expect(mockRows).not.toHaveBeenCalled();
  });

  it("serves repeat lookups from the cache until it is cleared", async () => {
    mockRows.mockResolvedValue([row("sherlock holmes")]);

    await getAllCharacters();
    await getAllCharacters();
    expect(mockRows).toHaveBeenCalledTimes(1);

    clearCharactersCache();
    await getAllCharacters();
    expect(mockRows).toHaveBeenCalledTimes(2);
  });
});

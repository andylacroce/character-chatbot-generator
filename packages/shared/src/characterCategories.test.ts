import {
  CHARACTER_CATEGORIES,
  getCharacterCategoryLabel,
  getCharacterCategoryOrder,
  isCharacterCategory,
} from "./characterCategories";

describe("characterCategories", () => {
  it("recognizes only persisted taxonomy identifiers", () => {
    expect(CHARACTER_CATEGORIES.map(({ value }) => value)).toEqual([
      "history",
      "mythology",
      "literature",
      "folklore",
      "religion",
    ]);
    expect(isCharacterCategory("literature")).toBe(true);
    expect(isCharacterCategory("historical")).toBe(false);
    expect(isCharacterCategory(null)).toBe(false);
  });

  it("provides labels and labels unknown values Uncategorized", () => {
    expect(getCharacterCategoryLabel("history")).toBe("Historical Figures");
    expect(getCharacterCategoryLabel("missing")).toBe("Uncategorized");
  });

  it("keeps unknown values at the end of the curated display order", () => {
    expect(getCharacterCategoryOrder("history")).toBeLessThan(
      getCharacterCategoryOrder("literature"),
    );
    expect(getCharacterCategoryOrder("missing")).toBe(CHARACTER_CATEGORIES.length);
  });
});

import {
  CHARACTER_CATEGORIES,
  getCharacterCategoryLabel,
  getCharacterCategoryOrder,
  isCharacterCategory,
} from "../../../src/utils/characterCategories";

describe("characterCategories", () => {
  it("recognizes only persisted taxonomy identifiers", () => {
    expect(CHARACTER_CATEGORIES.map(({ value }) => value)).toEqual([
      "history",
      "mythology",
      "literature",
      "folklore",
      "religion",
      "other",
    ]);
    expect(isCharacterCategory("literature")).toBe(true);
    expect(isCharacterCategory("historical")).toBe(false);
    expect(isCharacterCategory(null)).toBe(false);
  });

  it("provides labels and degrades unknown values to Other", () => {
    expect(getCharacterCategoryLabel("history")).toBe("Historical Figures");
    expect(getCharacterCategoryLabel("missing")).toBe("Other");
  });

  it("keeps unknown values at the end of the curated display order", () => {
    expect(getCharacterCategoryOrder("history")).toBeLessThan(
      getCharacterCategoryOrder("literature"),
    );
    expect(getCharacterCategoryOrder("missing")).toBe(getCharacterCategoryOrder("other"));
  });
});

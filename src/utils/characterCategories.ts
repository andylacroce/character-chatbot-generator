/** Stable taxonomy used to classify and group public Character Wall portraits. */
export const CHARACTER_CATEGORIES = [
  { value: "history", label: "Historical Figures" },
  { value: "mythology", label: "Mythology" },
  { value: "literature", label: "Literature" },
  { value: "folklore", label: "Folklore & Legend" },
  { value: "religion", label: "Religion & Philosophy" },
  { value: "other", label: "Other" },
] as const;

export type CharacterCategory = (typeof CHARACTER_CATEGORIES)[number]["value"];

const CATEGORY_VALUES = new Set<string>(CHARACTER_CATEGORIES.map(({ value }) => value));

/** Returns whether an unknown value is one of the persisted category identifiers. */
export function isCharacterCategory(value: unknown): value is CharacterCategory {
  return typeof value === "string" && CATEGORY_VALUES.has(value);
}

/** Maps persisted category values to display labels, treating missing legacy data as Other. */
export function getCharacterCategoryLabel(value: unknown): string {
  const category = CHARACTER_CATEGORIES.find((entry) => entry.value === value);
  return category?.label ?? "Other";
}

/** Provides the curated display order for grouped Character Wall sections. */
export function getCharacterCategoryOrder(value: unknown): number {
  const index = CHARACTER_CATEGORIES.findIndex((entry) => entry.value === value);
  return index === -1 ? CHARACTER_CATEGORIES.length - 1 : index;
}

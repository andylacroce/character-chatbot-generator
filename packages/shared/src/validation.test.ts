import { sanitizeCharacterName, sanitizeDescription, sanitizeUserName } from "./validation";

describe("sanitizeCharacterName", () => {
  it("strips HTML/script injection characters and trims", () => {
    expect(sanitizeCharacterName(`  Sherlock <Holmes> & "Watson"'s  `)).toBe(
      "Sherlock Holmes  Watsons",
    );
  });

  it("caps length at 100", () => {
    expect(sanitizeCharacterName("a".repeat(150))).toHaveLength(100);
  });

  it("returns empty string for non-string input", () => {
    expect(sanitizeCharacterName(undefined as unknown as string)).toBe("");
  });
});

describe("sanitizeDescription", () => {
  it("preserves quotes and punctuation but strips angle brackets/backticks", () => {
    expect(sanitizeDescription(`A "brave" knight <script>`)).toBe('A "brave" knight script');
  });

  it("caps length at 500", () => {
    expect(sanitizeDescription("a".repeat(600))).toHaveLength(500);
  });
});

describe("sanitizeUserName", () => {
  it("preserves apostrophes and hyphens", () => {
    expect(sanitizeUserName("Mary-Jane O'Brien")).toBe("Mary-Jane O'Brien");
  });

  it("caps length at 50", () => {
    expect(sanitizeUserName("a".repeat(60))).toHaveLength(50);
  });
});

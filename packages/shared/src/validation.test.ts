import {
  characterSlug,
  displayCharacterName,
  sanitizeCharacterName,
  sanitizeUserName,
} from "./validation";

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

describe("sanitizeUserName", () => {
  it("preserves apostrophes and hyphens", () => {
    expect(sanitizeUserName("Mary-Jane O'Brien")).toBe("Mary-Jane O'Brien");
  });

  it("caps length at 50", () => {
    expect(sanitizeUserName("a".repeat(60))).toHaveLength(50);
  });
});

describe("displayCharacterName", () => {
  it("drops a trailing disambiguation qualifier", () => {
    expect(displayCharacterName("David Copperfield (Charles Dickens novel)")).toBe(
      "David Copperfield",
    );
    expect(displayCharacterName("The Emperor (The Emperor's New Clothes)")).toBe("The Emperor");
  });

  it("leaves names without a trailing qualifier alone", () => {
    expect(displayCharacterName("Sherlock Holmes")).toBe("Sherlock Holmes");
    expect(displayCharacterName("Mr. (Bob) Smith")).toBe("Mr. (Bob) Smith");
  });

  it("stays fast on long runs of spaces", () => {
    const hostile = "a" + " ".repeat(100_000) + "(";
    const start = Date.now();
    expect(displayCharacterName(hostile)).toBe(hostile);
    expect(displayCharacterName(" ".repeat(100_000) + "(x)")).toBe(" ".repeat(100_000) + "(x)");
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("never returns an empty name", () => {
    expect(displayCharacterName("(Anonymous)")).toBe("(Anonymous)");
  });
});

describe("characterSlug", () => {
  it.each([
    ["Joan of Arc", "joan-of-arc"],
    ["  Sherlock   Holmes  ", "sherlock-holmes"],
    ["Molière", "moliere"],
    ["David Copperfield (Charles Dickens novel)", "david-copperfield-charles-dickens-novel"],
    ["Winnie-the-Pooh", "winnie-the-pooh"],
    ["Ramesses II!", "ramesses-ii"],
  ])("slugs %p as %p", (name, slug) => {
    expect(characterSlug(name)).toBe(slug);
  });

  it("returns an empty slug for a name with no ASCII letters or digits", () => {
    expect(characterSlug("孔子")).toBe("");
    expect(characterSlug("   ")).toBe("");
  });
});

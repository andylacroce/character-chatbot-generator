import characterNames from "../../../src/data/characterNames";

describe("characterNames", () => {
  it("exports a large pool of names", () => {
    expect(Array.isArray(characterNames)).toBe(true);
    expect(characterNames.length).toBeGreaterThan(500);
  });

  it("contains no duplicates", () => {
    // The module dedupes on load; this pins that the export stays deduped as the
    // list grows, so /api/random-character does not repeat itself unnecessarily.
    expect(new Set(characterNames).size).toBe(characterNames.length);
  });

  it("contains no empty or untrimmed entries", () => {
    for (const name of characterNames) {
      expect(typeof name).toBe("string");
      expect(name).toBe(name.trim());
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("covers the public-domain categories the copyright guardrail relies on", () => {
    // Suggestions surfaced by CopyrightWarningModal come from this pool, so it has
    // to actually span mythology, pre-1928 literature and historical figures.
    expect(characterNames).toEqual(
      expect.arrayContaining(["Zeus", "Sherlock Holmes", "Cleopatra"]),
    );
  });

  it("never contains a bare generic-noun/archetype entry with no disambiguating context", () => {
    // Regression test for a live prod incident: this list is trusted BLINDLY by both
    // /api/random-character and the guessing game (src/utils/pickRandomCharacterName.ts) —
    // neither path ever calls /api/validate-character's Claude-based recognition check.
    // A bare "Hero" entry here meant the game/Random button could pick it, generate a
    // personality from just that word with zero context, and publish the result to the
    // public Character Wall as recognized: true. Fixed by disambiguating both real
    // "Hero" entries (Much Ado About Nothing; the Hero-and-Leander myth) — this test
    // pins that no equally-ambiguous bare word slips back in later. Entries that
    // disambiguate a genuine collision (e.g. "Hero (Much Ado About Nothing)") are fine;
    // only an exact, context-free match against this denylist fails.
    const genericArchetypes = new Set([
      "hero",
      "witch",
      "wizard",
      "king",
      "queen",
      "prince",
      "princess",
      "knight",
      "warrior",
      "villain",
      "ghost",
      "giant",
      "dragon",
      "angel",
      "demon",
      "detective",
      "ninja",
      "samurai",
      "pirate",
      "vampire",
      "werewolf",
      "monster",
      "robot",
      "alien",
      "goddess",
      "god",
      "priest",
      "priestess",
      "sorcerer",
      "sorceress",
      "fairy",
      "elf",
      "dwarf",
      "hunter",
      "explorer",
      "sage",
      "oracle",
      "prophet",
      "jester",
      "fool",
      "bard",
      "minstrel",
    ]);
    const offenders = characterNames.filter((name) => genericArchetypes.has(name.toLowerCase()));
    expect(offenders).toEqual([]);
  });
});

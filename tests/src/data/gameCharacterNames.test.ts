import gameCharacterNames from "../../../src/data/gameCharacterNames";
import characterNames from "../../../src/data/characterNames";

describe("gameCharacterNames", () => {
  it("exports a sizeable pool of names", () => {
    expect(Array.isArray(gameCharacterNames)).toBe(true);
    expect(gameCharacterNames.length).toBeGreaterThan(300);
  });

  it("contains no duplicates", () => {
    expect(new Set(gameCharacterNames).size).toBe(gameCharacterNames.length);
  });

  it("is a curated subset of the master character list, not an independently spelled list", () => {
    // Every entry here must be copied verbatim (same spelling/disambiguation suffix)
    // from characterNames.ts, so the game never guesses a name Claude can't resolve
    // back to the canonical, already-vetted spelling. See gameCharacterNames.ts's own
    // doc comment / GitHub issue #878 for why this list exists at all.
    const master = new Set(characterNames);
    const notInMaster = gameCharacterNames.filter((name) => !master.has(name));
    expect(notInMaster).toEqual([]);
  });

  it("contains no empty or untrimmed entries", () => {
    for (const name of gameCharacterNames) {
      expect(typeof name).toBe("string");
      expect(name).toBe(name.trim());
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("includes household-name figures the game should be gettable with", () => {
    expect(gameCharacterNames).toEqual(
      expect.arrayContaining([
        "Zeus",
        "Sherlock Holmes",
        "Cinderella",
        "Napoleon Bonaparte",
        "Dracula",
      ]),
    );
  });
});

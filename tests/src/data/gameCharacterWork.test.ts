import gameCharacterNames from "../../../src/data/gameCharacterNames";
import gameCharacterWork from "../../../src/data/gameCharacterWork";

describe("gameCharacterWork", () => {
  it("has a grounding entry for every name in gameCharacterNames", () => {
    // The structural fix for a long run of disambiguation incidents (Hero, Beauty,
    // David Copperfield, The Emperor, The Knight, The Monster, Scarecrow/Tin Man/
    // Cowardly Lion) — every game character must carry explicit source-work grounding,
    // not just the ones a live incident happened to reveal as ambiguous. A future
    // addition to gameCharacterNames.ts with no matching entry here fails this test
    // rather than shipping ungrounded and waiting for a live bug report.
    const missing = gameCharacterNames.filter((name) => !(name in gameCharacterWork));
    expect(missing).toEqual([]);
  });

  it("has no orphaned entries for names no longer in gameCharacterNames", () => {
    const names = new Set(gameCharacterNames);
    const orphaned = Object.keys(gameCharacterWork).filter((name) => !names.has(name));
    expect(orphaned).toEqual([]);
  });

  it("contains no empty or untrimmed work values", () => {
    for (const [name, work] of Object.entries(gameCharacterWork)) {
      expect(typeof work).toBe("string");
      expect(work).toBe(work.trim());
      expect(work.length).toBeGreaterThan(0);
      expect(work.toLowerCase()).not.toBe(name.toLowerCase());
    }
  });
});

import crypto from "crypto";
import { pickRandomCharacterName } from "../../../src/utils/pickRandomCharacterName";
import characterNames from "../../../src/data/characterNames";

describe("pickRandomCharacterName", () => {
  const originalRandomInt = crypto.randomInt;

  afterEach(() => {
    crypto.randomInt = originalRandomInt;
  });

  it("with no exclusions, returns a name that's actually in the list", () => {
    const name = pickRandomCharacterName();
    expect(characterNames).toContain(name);
  });

  it("with no arguments, also returns a name in the list (default excludeNames)", () => {
    const name = pickRandomCharacterName(undefined);
    expect(characterNames).toContain(name);
  });

  it("never returns an excluded name across many draws", () => {
    const excluded = characterNames.slice(0, 50);
    for (let i = 0; i < 200; i++) {
      const name = pickRandomCharacterName(excluded);
      expect(excluded).not.toContain(name);
    }
  });

  it("lands on a specific index outside the excluded set when randomInt is fixed", () => {
    const excluded = [characterNames[0]];
    const available = characterNames.filter((n) => n !== characterNames[0]);

    // Force randomInt to select index 0 of the *available* (post-filter) pool.
    crypto.randomInt = jest.fn(() => 0) as unknown as typeof crypto.randomInt;
    const first = pickRandomCharacterName(excluded);
    expect(first).toBe(available[0]);

    // Force randomInt to select the last index of the available pool.
    crypto.randomInt = jest.fn(() => available.length - 1) as unknown as typeof crypto.randomInt;
    const last = pickRandomCharacterName(excluded);
    expect(last).toBe(available[available.length - 1]);
  });

  it("falls back to the full list once every name has been excluded, never throwing or returning undefined", () => {
    const name = pickRandomCharacterName(characterNames);
    expect(name).toBeDefined();
    expect(characterNames).toContain(name);
  });

  it("falls back to the full list with a fixed randomInt when everything is excluded", () => {
    crypto.randomInt = jest.fn(() => 0) as unknown as typeof crypto.randomInt;
    const name = pickRandomCharacterName(characterNames);
    expect(name).toBe(characterNames[0]);
  });

  it("excludes names case-insensitively", () => {
    const target = characterNames[5];
    const excludedDifferentCase = [target.toUpperCase()];
    for (let i = 0; i < 100; i++) {
      const name = pickRandomCharacterName(excludedDifferentCase);
      expect(name.toLowerCase()).not.toBe(target.toLowerCase());
    }
  });
});

const mockPickRandomCharacterName = jest.fn();
jest.mock("../../../src/utils/pickRandomCharacterName", () => ({
  pickRandomCharacterName: (...args: unknown[]) => mockPickRandomCharacterName(...args),
}));

const mockGenerateCharacterClues = jest.fn();
jest.mock("../../../src/config/serverConfig", () => ({
  generateCharacterClues: (...args: unknown[]) => mockGenerateCharacterClues(...args),
}));

import { generateGuessWhoRound } from "../../../src/utils/guessWhoRound";
import gameCharacterNames from "../../../src/data/gameCharacterNames";
import gameCharacterWork from "../../../src/data/gameCharacterWork";

describe("guessWhoRound", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPickRandomCharacterName.mockReturnValue("Irene Adler");
    mockGenerateCharacterClues.mockResolvedValue({
      clues: ["1", "2", "3", "4", "5"],
    });
  });

  it("picks a hidden name excluding usedNames, drawing from the game's curated pool", async () => {
    await generateGuessWhoRound(["Sherlock Holmes"]);
    expect(mockPickRandomCharacterName).toHaveBeenCalledWith(
      ["Sherlock Holmes"],
      gameCharacterNames,
    );
  });

  it("grounds clue generation with the character's work, when known", async () => {
    await generateGuessWhoRound([]);
    expect(mockGenerateCharacterClues).toHaveBeenCalledWith(
      "Irene Adler",
      gameCharacterWork["Irene Adler"],
    );
  });

  it("returns the hidden name and its clues", async () => {
    const result = await generateGuessWhoRound([]);
    expect(result).toEqual({
      hiddenName: "Irene Adler",
      clues: ["1", "2", "3", "4", "5"],
    });
  });
});

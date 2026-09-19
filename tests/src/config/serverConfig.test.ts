const mockCreate = jest.fn();
jest.mock("../../../src/utils/anthropicClient", () => ({
  __esModule: true,
  default: { messages: { create: (...args: unknown[]) => mockCreate(...args) } },
}));
jest.mock("../../../src/utils/claudeModelSelector", () => ({
  getClaudeModel: jest.fn(() => "claude-haiku-4-5-20251001"),
}));

import {
  RESPONSE_CONSTRAINTS,
  CONTENT_GUIDELINES,
  generatePersonalityPrompt,
} from "../../../src/config/serverConfig";
import { getClaudeModel } from "../../../src/utils/claudeModelSelector";

const fullConfig = {
  speakingStyle: "formal and articulate",
  personalityTraits: "confident, analytical",
  knowledgeDomains: "deduction, chemistry",
  behavioralGuidelines: "Show impatience with the obvious.",
  quirks: "Plays violin while thinking.",
};

function claudeReturns(text: string) {
  mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text }] });
}

describe("serverConfig", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("generatePersonalityPrompt", () => {
    it("builds a prompt from the structured JSON Claude returns", async () => {
      claudeReturns(JSON.stringify(fullConfig));

      const { prompt } = await generatePersonalityPrompt("Sherlock Holmes");

      expect(prompt).toContain("You are Sherlock Holmes.");
      expect(prompt).toContain("SPEAKING STYLE: formal and articulate");
      expect(prompt).toContain("PERSONALITY: confident, analytical");
      expect(prompt).toContain("KNOWLEDGE: deduction, chemistry");
      expect(prompt).toContain("BEHAVIOR: Show impatience with the obvious.");
      expect(prompt).toContain("QUIRKS: Plays violin while thinking.");
      expect(prompt).toContain(RESPONSE_CONSTRAINTS);
      expect(prompt).toContain(CONTENT_GUIDELINES);
    });

    it("uses the cheap text-simple tier for this one-shot JSON task", async () => {
      claudeReturns(JSON.stringify(fullConfig));

      await generatePersonalityPrompt("Sherlock Holmes");

      expect(getClaudeModel).toHaveBeenCalledWith("text-simple");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-haiku-4-5-20251001" }),
      );
    });

    it("substitutes defaults for fields Claude omits", async () => {
      claudeReturns(JSON.stringify({ speakingStyle: "terse" }));

      const { prompt } = await generatePersonalityPrompt("Ada Lovelace");

      expect(prompt).toContain("SPEAKING STYLE: terse");
      expect(prompt).toContain("PERSONALITY: Stay true to character");
      expect(prompt).toContain("KNOWLEDGE: Use your internal knowledge");
      expect(prompt).toContain("BEHAVIOR: Respond naturally in character");
      expect(prompt).toContain("QUIRKS: Express character-specific mannerisms");
    });

    it("extracts JSON that Claude wrapped in prose or fences", async () => {
      claudeReturns("Here you go:\n```json\n" + JSON.stringify(fullConfig) + "\n```");

      const { prompt } = await generatePersonalityPrompt("Sherlock Holmes");

      expect(prompt).toContain("SPEAKING STYLE: formal and articulate");
    });

    it("falls back to the simple template when Claude returns unparseable JSON", async () => {
      claudeReturns("not json at all");

      const { prompt } = await generatePersonalityPrompt("Ada Lovelace");

      expect(prompt).toContain("You are Ada Lovelace. Stay in character");
      expect(prompt).toContain(RESPONSE_CONSTRAINTS);
      expect(prompt).toContain(CONTENT_GUIDELINES);
    });

    it("falls back to the simple template when the API call fails", async () => {
      mockCreate.mockRejectedValueOnce(new Error("network down"));

      const { prompt } = await generatePersonalityPrompt("Ada Lovelace");

      expect(prompt).toContain("You are Ada Lovelace. Stay in character");
    });

    it("builds an all-defaults prompt when the response has no text block", async () => {
      // A non-text block is read as `{}`, which parses cleanly, so this takes the
      // structured path with every field defaulted rather than the error fallback.
      mockCreate.mockResolvedValueOnce({ content: [{ type: "image" }] });

      const { prompt } = await generatePersonalityPrompt("Ada Lovelace");

      expect(prompt).toContain("SPEAKING STYLE: Natural and authentic to character");
      expect(prompt).toContain("QUIRKS: Express character-specific mannerisms");
    });

    it("returns Claude's correctedName, used in the built prompt too", async () => {
      claudeReturns(JSON.stringify({ ...fullConfig, correctedName: "Sherlock Holmes" }));

      const { prompt, correctedName } = await generatePersonalityPrompt("sherlok holmes");

      expect(correctedName).toBe("Sherlock Holmes");
      expect(prompt).toContain("You are Sherlock Holmes.");
    });

    it("falls back to the original name when Claude omits correctedName", async () => {
      claudeReturns(JSON.stringify(fullConfig));

      const { correctedName } = await generatePersonalityPrompt("Ada Lovelace");

      expect(correctedName).toBe("Ada Lovelace");
    });

    it("falls back to the original name on the error path too", async () => {
      mockCreate.mockRejectedValueOnce(new Error("network down"));

      const { correctedName } = await generatePersonalityPrompt("Ada Lovelace");

      expect(correctedName).toBe("Ada Lovelace");
    });

    it("passes existingNames through to the prompt for fuzzy matching", async () => {
      claudeReturns(JSON.stringify(fullConfig));

      await generatePersonalityPrompt("sherlok holmes", undefined, [
        "Sherlock Holmes",
        "Cleopatra",
      ]);

      const { system } = mockCreate.mock.calls[0][0];
      expect(system).toContain("EXISTING_NAMES: Sherlock Holmes, Cleopatra");
    });

    it("instructs Claude to expand correctedName to the fullest known form, with or without existingNames", async () => {
      claudeReturns(JSON.stringify(fullConfig));
      await generatePersonalityPrompt("Einstein");
      const { system: systemWithoutExisting } = mockCreate.mock.calls[0][0];
      expect(systemWithoutExisting).toContain("fullest commonly recognized name");
      expect(systemWithoutExisting).toContain("Albert Einstein");
      expect(systemWithoutExisting).toContain("Never fabricate a surname");

      jest.clearAllMocks();
      claudeReturns(JSON.stringify(fullConfig));
      await generatePersonalityPrompt("Einstein", undefined, ["Cleopatra"]);
      const { system: systemWithExisting } = mockCreate.mock.calls[0][0];
      expect(systemWithExisting).toContain("fullest commonly recognized name");
    });

    it("returns Claude's expanded correctedName (e.g. a fuller name), used in the built prompt too", async () => {
      claudeReturns(JSON.stringify({ ...fullConfig, correctedName: "Albert Einstein" }));

      const { prompt, correctedName } = await generatePersonalityPrompt("Einstein");

      expect(correctedName).toBe("Albert Einstein");
      expect(prompt).toContain("You are Albert Einstein.");
    });
  });
});

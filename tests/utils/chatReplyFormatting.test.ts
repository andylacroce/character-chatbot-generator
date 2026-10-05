import {
  gracefullyWrapResponse,
  isClaudeResponse,
  stripActionEmotes,
} from "../../src/utils/chatReplyFormatting";

describe("isClaudeResponse", () => {
  it("accepts an object with a content array and rejects everything else", () => {
    expect(isClaudeResponse({ content: [] })).toBe(true);
    for (const bad of [null, undefined, "x", 3, {}, { content: "text" }]) {
      expect(isClaudeResponse(bad)).toBe(false);
    }
  });
});

describe("stripActionEmotes", () => {
  it("removes *action* text, collapses blank runs and trims", () => {
    expect(stripActionEmotes("*smiles* Hello there.\n\n\n\nFarewell. *bows*")).toBe(
      "Hello there.\n\nFarewell.",
    );
  });

  it("leaves text without emotes alone", () => {
    expect(stripActionEmotes("Plain speech.")).toBe("Plain speech.");
  });
});

describe("gracefullyWrapResponse", () => {
  it("returns empty input unchanged", () => {
    expect(gracefullyWrapResponse("")).toBe("");
  });

  it("keeps a properly terminated reply, trimming trailing space", () => {
    expect(gracefullyWrapResponse("All done!  ")).toBe("All done!");
    expect(gracefullyWrapResponse("Is it?")).toBe("Is it?");
  });

  it("turns a trailing comma into a period", () => {
    expect(gracefullyWrapResponse("Well, then,")).toBe("Well, then.");
  });

  it("cuts a truncated reply back to its last sentence when that is most of the text", () => {
    expect(
      gracefullyWrapResponse("First sentence here. Second one goes on and on and on and wh"),
    ).toBe("First sentence here. Second one goes on and on and on and wh.");
    expect(
      gracefullyWrapResponse("A complete first sentence that is quite long indeed. And then a tr"),
    ).toBe("A complete first sentence that is quite long indeed.");
  });

  it("drops a long dangling fragment when there is no usable punctuation", () => {
    expect(gracefullyWrapResponse("one two three four five six sevenxxxxxxxxxxxx")).toBe(
      "one two three four five six.",
    );
  });

  it("just appends a period to a short trailing fragment or a single word", () => {
    expect(gracefullyWrapResponse("one two three four five six seven eigh")).toBe(
      "one two three four five six seven eigh.",
    );
    expect(gracefullyWrapResponse("short")).toBe("short.");
  });
});

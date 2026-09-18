import { getReplayAudioUrl } from "../../../src/utils/replayAudio";

describe("getReplayAudioUrl", () => {
  it("reuses the audio URL already attached to a message", () => {
    expect(
      getReplayAudioUrl({
        audioFileUrl: "/api/audio?file=existing.mp3",
        text: "Existing reply",
        botName: "Gandalf",
      }),
    ).toBe("/api/audio?file=existing.mp3");
  });

  it("builds a stable regeneration URL for persisted messages without audio metadata", () => {
    const options = {
      text: "A reply restored from the server.",
      botName: "Gandalf",
      gender: "male",
      voiceConfig: {
        languageCodes: ["en-US"],
        name: "en-US-Wavenet-D",
        ssmlGender: 1,
        pitch: 0,
        rate: 1,
        type: "Wavenet",
      },
    };

    const first = getReplayAudioUrl(options);
    const second = getReplayAudioUrl(options);
    const parsed = new URL(first, "https://example.test");

    expect(second).toBe(first);
    expect(parsed.pathname).toBe("/api/audio");
    expect(parsed.searchParams.get("file")).toMatch(/^replay-[a-z0-9]+\.mp3$/);
    expect(parsed.searchParams.get("text")).toBe(options.text);
    expect(parsed.searchParams.get("botName")).toBe(options.botName);
    expect(parsed.searchParams.get("gender")).toBe(options.gender);
    expect(JSON.parse(parsed.searchParams.get("voiceConfig") ?? "null")).toEqual(
      options.voiceConfig,
    );
  });

  it("uses a different cache filename when the message text changes", () => {
    const first = new URL(
      getReplayAudioUrl({ text: "First", botName: "Gandalf" }),
      "https://example.test",
    );
    const second = new URL(
      getReplayAudioUrl({ text: "Second", botName: "Gandalf" }),
      "https://example.test",
    );

    expect(first.searchParams.get("file")).not.toBe(second.searchParams.get("file"));
  });
});

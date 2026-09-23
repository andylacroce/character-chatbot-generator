import {
  getReplayAudioUrl,
  extractVoiceConfigFromAudioUrl,
  findSpeakerVoiceConfig,
} from "./replayAudio";

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

describe("extractVoiceConfigFromAudioUrl", () => {
  const voiceConfig = {
    languageCodes: ["en-GB"],
    name: "en-GB-Standard-B",
    ssmlGender: 1,
    pitch: -2,
    rate: 0.95,
  };

  it("recovers the voiceConfig embedded in a real /api/audio URL", () => {
    const url = `/api/audio?file=abc.mp3&text=Hi&botName=Oedipus&gender=male&voiceConfig=${encodeURIComponent(
      JSON.stringify(voiceConfig),
    )}`;
    expect(extractVoiceConfigFromAudioUrl(url)).toEqual(voiceConfig);
  });

  it("returns null for an undefined URL", () => {
    expect(extractVoiceConfigFromAudioUrl(undefined)).toBeNull();
  });

  it("returns null when the URL has no voiceConfig param", () => {
    expect(extractVoiceConfigFromAudioUrl("/api/audio?file=abc.mp3&text=Hi")).toBeNull();
  });

  it("returns null when the voiceConfig param is not valid JSON", () => {
    expect(extractVoiceConfigFromAudioUrl("/api/audio?voiceConfig=not-json")).toBeNull();
  });
});

describe("findSpeakerVoiceConfig", () => {
  const oedipusVoiceConfig = {
    languageCodes: ["en-US"],
    name: "en-US-Standard-A",
    ssmlGender: 1,
  };

  it("finds a speaker's voiceConfig from an earlier message in the transcript", () => {
    const messages = [
      {
        sender: "Oedipus",
        audioFileUrl: `/api/audio?voiceConfig=${encodeURIComponent(
          JSON.stringify(oedipusVoiceConfig),
        )}`,
      },
      { sender: "User", audioFileUrl: undefined },
      // This later message has no audio of its own — this is the one being replayed.
      { sender: "Oedipus", audioFileUrl: undefined },
    ];
    expect(findSpeakerVoiceConfig(messages, "Oedipus")).toEqual(oedipusVoiceConfig);
  });

  it("prefers the most recent matching message when several carry a voiceConfig", () => {
    const olderConfig = { languageCodes: ["en-US"], name: "en-US-Wavenet-D", ssmlGender: 1 };
    const newerConfig = { languageCodes: ["en-US"], name: "en-US-Standard-A", ssmlGender: 1 };
    const messages = [
      {
        sender: "Oedipus",
        audioFileUrl: `/api/audio?voiceConfig=${encodeURIComponent(JSON.stringify(olderConfig))}`,
      },
      {
        sender: "Oedipus",
        audioFileUrl: `/api/audio?voiceConfig=${encodeURIComponent(JSON.stringify(newerConfig))}`,
      },
    ];
    expect(findSpeakerVoiceConfig(messages, "Oedipus")).toEqual(newerConfig);
  });

  it("returns null when no message from that speaker carries a voiceConfig", () => {
    const messages = [{ sender: "Oedipus", audioFileUrl: undefined }];
    expect(findSpeakerVoiceConfig(messages, "Oedipus")).toBeNull();
  });

  it("ignores messages from a different speaker", () => {
    const messages = [
      {
        sender: "Sherlock Holmes",
        audioFileUrl: `/api/audio?voiceConfig=${encodeURIComponent(
          JSON.stringify(oedipusVoiceConfig),
        )}`,
      },
    ];
    expect(findSpeakerVoiceConfig(messages, "Oedipus")).toBeNull();
  });
});

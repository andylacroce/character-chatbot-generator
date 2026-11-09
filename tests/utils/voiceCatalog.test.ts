import {
  __resetVoiceCatalogForTest,
  findAvailableVoice,
  formatVoiceCatalog,
  getAvailableGoogleVoices,
  mapSsmlToGender,
  parseGoogleSsmlGender,
} from "../../src/utils/chat/voiceCatalog";
import { SSML_GENDER } from "../../src/utils/chat/voiceTypes";

const mockListVoices = jest.fn();
jest.mock("../../src/utils/chat/tts", () => ({
  getTTSClient: () => ({ listVoices: mockListVoices }),
}));

const voice = (name: string, ssmlGender: unknown, languageCodes = ["en-GB"]) => ({
  name,
  ssmlGender,
  languageCodes,
});

describe("parseGoogleSsmlGender", () => {
  it("reads the protobuf enum's string key, which is what a real ListVoices returns", () => {
    expect(parseGoogleSsmlGender("FEMALE")).toBe(SSML_GENDER.FEMALE);
    expect(parseGoogleSsmlGender("MALE")).toBe(SSML_GENDER.MALE);
    expect(parseGoogleSsmlGender("NEUTRAL")).toBe(SSML_GENDER.NEUTRAL);
  });

  it("passes a numeric value through and treats anything else as unspecified", () => {
    expect(parseGoogleSsmlGender(2)).toBe(2);
    expect(parseGoogleSsmlGender("ROBOT")).toBe(SSML_GENDER.UNSPECIFIED);
    expect(parseGoogleSsmlGender(undefined)).toBe(SSML_GENDER.UNSPECIFIED);
  });
});

describe("mapSsmlToGender", () => {
  it("maps to the model-facing profile value, defaulting to male", () => {
    expect(mapSsmlToGender(SSML_GENDER.FEMALE)).toBe("female");
    expect(mapSsmlToGender(SSML_GENDER.NEUTRAL)).toBe("neutral");
    expect(mapSsmlToGender(SSML_GENDER.MALE)).toBe("male");
    expect(mapSsmlToGender(SSML_GENDER.UNSPECIFIED)).toBe("male");
  });
});

describe("getAvailableGoogleVoices", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetVoiceCatalogForTest();
  });

  it("keeps only supported, gendered, language-tagged voices, sorted by name", async () => {
    mockListVoices.mockResolvedValue([
      {
        voices: [
          voice("en-GB-Wavenet-D", "MALE"),
          voice("en-GB-Neural2-A", "FEMALE"),
          voice("en-US-Chirp-X", "FEMALE"),
          voice("en-GB-Wavenet-Z", "SSML_VOICE_GENDER_UNSPECIFIED"),
          voice("en-GB-Wavenet-Q", "MALE", []),
          voice("", "MALE"),
        ],
      },
    ]);
    const voices = await getAvailableGoogleVoices();
    expect(voices.map((v) => v.name)).toEqual(["en-GB-Neural2-A", "en-GB-Wavenet-D"]);
  });

  it("caches the catalog for the life of the process", async () => {
    mockListVoices.mockResolvedValue([{ voices: [voice("en-GB-Wavenet-D", "MALE")] }]);
    await getAvailableGoogleVoices();
    await getAvailableGoogleVoices();
    expect(mockListVoices).toHaveBeenCalledTimes(1);
  });

  it("rejects when Google returns no supported voices, and retries next time", async () => {
    mockListVoices.mockResolvedValueOnce([{ voices: [] }]);
    await expect(getAvailableGoogleVoices()).rejects.toThrow("no supported voices");
    mockListVoices.mockResolvedValueOnce([{ voices: [voice("en-GB-Wavenet-D", "MALE")] }]);
    await expect(getAvailableGoogleVoices()).resolves.toHaveLength(1);
  });
});

describe("formatVoiceCatalog and findAvailableVoice", () => {
  const voices = [
    { name: "en-GB-Wavenet-D", languageCodes: ["en-GB"], ssmlGender: SSML_GENDER.MALE },
    { name: "fr-FR-Neural2-A", languageCodes: ["fr-FR", "fr-CA"], ssmlGender: SSML_GENDER.FEMALE },
  ];

  it("formats one line per voice for the casting prompt", () => {
    expect(formatVoiceCatalog(voices)).toBe(
      "en-GB-Wavenet-D | en-GB | male\nfr-FR-Neural2-A | fr-FR,fr-CA | female",
    );
  });

  it("finds a voice by exact name only", () => {
    expect(findAvailableVoice(voices, "fr-FR-Neural2-A")).toBe(voices[1]);
    expect(findAvailableVoice(voices, "fr-FR-Neural2")).toBeUndefined();
  });
});

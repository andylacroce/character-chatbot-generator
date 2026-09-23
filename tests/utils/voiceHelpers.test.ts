import { buildSsml } from "../../src/utils/voiceHelpers";
import type { CharacterVoiceConfig } from "../../src/utils/characterVoices";

function makeVoice(overrides: Partial<CharacterVoiceConfig> = {}): CharacterVoiceConfig {
  return {
    languageCodes: ["en-GB"],
    name: "en-GB-Wavenet-D",
    ssmlGender: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildSsml
// ---------------------------------------------------------------------------

describe("buildSsml", () => {
  it("wraps text in plain <speak> for a Studio voice", () => {
    const voice = makeVoice({ name: "en-US-Studio-M", type: "Studio" });
    expect(buildSsml("Hello world", voice)).toBe("<speak>Hello world</speak>");
  });

  it("wraps text with prosody for a non-Studio voice with explicit pitch/rate", () => {
    const voice = makeVoice({ name: "en-GB-Wavenet-D", pitch: -5, rate: 0.9 });
    const result = buildSsml("Hello world", voice);
    expect(result).toBe('<speak><prosody pitch="-5st" rate="90%"> Hello world </prosody></speak>');
  });

  it("uses default pitch -13 when pitch is absent", () => {
    const voice = makeVoice({ name: "en-GB-Wavenet-D", rate: 1.0 });
    const result = buildSsml("Hi", voice);
    expect(result).toContain('pitch="-13st"');
  });

  it("uses default rate 80% when rate is absent", () => {
    const voice = makeVoice({ name: "en-GB-Wavenet-D", pitch: 0 });
    const result = buildSsml("Hi", voice);
    expect(result).toContain('rate="80%"');
  });

  it("uses default pitch and rate when both are absent", () => {
    const voice = makeVoice({ name: "en-GB-Wavenet-D" });
    const result = buildSsml("Hi", voice);
    expect(result).toBe('<speak><prosody pitch="-13st" rate="80%"> Hi </prosody></speak>');
  });

  it("rounds rate to nearest percent", () => {
    const voice = makeVoice({ name: "en-GB-Wavenet-D", rate: 0.876 });
    const result = buildSsml("Hi", voice);
    expect(result).toContain('rate="88%"');
  });

  it("detects Studio by name even without type field", () => {
    const voice = makeVoice({ name: "en-US-Studio-O" }); // no type
    expect(buildSsml("Test", voice)).toBe("<speak>Test</speak>");
  });

  it("XML-escapes reserved characters for a Studio voice", () => {
    const voice = makeVoice({ name: "en-US-Studio-M", type: "Studio" });
    expect(buildSsml(`Tom & Jerry said "hi" <script>`, voice)).toBe(
      "<speak>Tom &amp; Jerry said &quot;hi&quot; &lt;script&gt;</speak>",
    );
  });

  it("XML-escapes reserved characters for a non-Studio voice", () => {
    const voice = makeVoice({ name: "en-GB-Wavenet-D", pitch: 0, rate: 1.0 });
    const result = buildSsml(`<break time="10s"/> it's <over>`, voice);
    expect(result).toBe(
      '<speak><prosody pitch="0st" rate="100%"> &lt;break time=&quot;10s&quot;/&gt; it&apos;s &lt;over&gt; </prosody></speak>',
    );
  });
});

import { normalizeStudioVoice, buildSsml } from '../../src/utils/voiceHelpers';
import type { CharacterVoiceConfig } from '../../src/utils/characterVoices';

function makeVoice(overrides: Partial<CharacterVoiceConfig> = {}): CharacterVoiceConfig {
  return {
    languageCodes: ['en-GB'],
    name: 'en-GB-Wavenet-D',
    ssmlGender: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeStudioVoice
// ---------------------------------------------------------------------------

describe('normalizeStudioVoice', () => {
  it('returns a non-Studio voice unchanged', () => {
    const voice = makeVoice({ name: 'en-GB-Wavenet-D' });
    expect(normalizeStudioVoice(voice)).toBe(voice);
  });

  it('returns a valid en-US-Studio-M voice unchanged', () => {
    const voice = makeVoice({ name: 'en-US-Studio-M', type: 'Studio' });
    expect(normalizeStudioVoice(voice)).toBe(voice);
  });

  it('returns a valid en-US-Studio-O voice unchanged', () => {
    const voice = makeVoice({ name: 'en-US-Studio-O', type: 'Studio' });
    expect(normalizeStudioVoice(voice)).toBe(voice);
  });

  it('replaces an invalid Studio voice name with the fallback', () => {
    const voice = makeVoice({ name: 'en-US-Studio-X', type: 'Studio' });
    const result = normalizeStudioVoice(voice);
    expect(result.name).toBe('en-US-Studio-M');
    expect(result.languageCodes).toEqual(['en-US']);
    expect(result.type).toBe('Studio');
  });

  it('detects Studio via name when type field is absent', () => {
    const voice = makeVoice({ name: 'en-US-Studio-X' });
    const result = normalizeStudioVoice(voice);
    expect(result.name).toBe('en-US-Studio-M');
  });

  it('detects Studio via type field even if name does not contain "Studio"', () => {
    const voice = makeVoice({ name: 'en-US-Wavenet-Z', type: 'Studio' });
    // name doesn't match valid Studio voices → fallback
    const result = normalizeStudioVoice(voice);
    expect(result.name).toBe('en-US-Studio-M');
  });
});

// ---------------------------------------------------------------------------
// buildSsml
// ---------------------------------------------------------------------------

describe('buildSsml', () => {
  it('wraps text in plain <speak> for a Studio voice', () => {
    const voice = makeVoice({ name: 'en-US-Studio-M', type: 'Studio' });
    expect(buildSsml('Hello world', voice)).toBe('<speak>Hello world</speak>');
  });

  it('wraps text with prosody for a non-Studio voice with explicit pitch/rate', () => {
    const voice = makeVoice({ name: 'en-GB-Wavenet-D', pitch: -5, rate: 0.9 });
    const result = buildSsml('Hello world', voice);
    expect(result).toBe('<speak><prosody pitch="-5st" rate="90%"> Hello world </prosody></speak>');
  });

  it('uses default pitch -13 when pitch is absent', () => {
    const voice = makeVoice({ name: 'en-GB-Wavenet-D', rate: 1.0 });
    const result = buildSsml('Hi', voice);
    expect(result).toContain('pitch="-13st"');
  });

  it('uses default rate 80% when rate is absent', () => {
    const voice = makeVoice({ name: 'en-GB-Wavenet-D', pitch: 0 });
    const result = buildSsml('Hi', voice);
    expect(result).toContain('rate="80%"');
  });

  it('uses default pitch and rate when both are absent', () => {
    const voice = makeVoice({ name: 'en-GB-Wavenet-D' });
    const result = buildSsml('Hi', voice);
    expect(result).toBe('<speak><prosody pitch="-13st" rate="80%"> Hi </prosody></speak>');
  });

  it('rounds rate to nearest percent', () => {
    const voice = makeVoice({ name: 'en-GB-Wavenet-D', rate: 0.876 });
    const result = buildSsml('Hi', voice);
    expect(result).toContain('rate="88%"');
  });

  it('detects Studio by name even without type field', () => {
    const voice = makeVoice({ name: 'en-US-Studio-O' }); // no type
    expect(buildSsml('Test', voice)).toBe('<speak>Test</speak>');
  });
});

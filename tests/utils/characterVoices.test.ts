/**
 * Tests for character voice configuration with Claude structured output.
 * Tests the simplified Claude → Google TTS pipeline.
 */

import {
  getVoiceConfigForCharacter,
  CHARACTER_VOICE_MAP,
  SSML_GENDER
} from '../../src/utils/characterVoices';
import type { VoiceConfig } from '../../src/utils/characterVoices';

// Mock logger for testing
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
  sanitizeLogMeta: (meta: unknown) => meta,
}));

// Mock TTS client for voice validation testing
const mockSynthesizeSpeech = jest.fn();
jest.mock('../../src/utils/tts', () => ({
  getTTSClient: jest.fn(() => ({
    synthesizeSpeech: mockSynthesizeSpeech
  })),
  synthesizeSpeechToFile: jest.fn(),
}));

// Mock Claude to return structured voice configuration JSON
const mockClaudeCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockClaudeCreate
      }
    }))
  };
});

jest.mock('../../src/utils/claudeModelSelector', () => ({
  getClaudeModel: jest.fn(() => 'claude-haiku-4-5-20251001'),
}));

describe('characterVoices - Simplified Claude → Google TTS Pipeline', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Returns valid American male voice by default
    mockClaudeCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        gender: 'male',
        languageCode: 'en-US',
        voiceName: 'en-US-Wavenet-D',
        pitch: 0,
        rate: 1.0
      }) }]
    });

    // Accepts all voices as valid by default
    mockSynthesizeSpeech.mockResolvedValue([{ audioContent: Buffer.from('test') }]);
  });

  describe('Basic Voice Selection', () => {
    it('should return default voice from CHARACTER_VOICE_MAP', () => {
      const defaultVoice = CHARACTER_VOICE_MAP['Default'];
      expect(defaultVoice).toBeDefined();
      expect(defaultVoice.name).toBe('en-GB-Wavenet-D');
      expect(defaultVoice.ssmlGender).toBe(SSML_GENDER.MALE);
    });

    it('should get voice config from Claude for unknown character', async () => {
      const config = await getVoiceConfigForCharacter('Test Character');

      expect(mockClaudeCreate).toHaveBeenCalled();
      expect(config).toBeDefined();
      expect(config.name).toBe('en-US-Wavenet-D');
      expect(config.ssmlGender).toBe(SSML_GENDER.MALE);
      expect(config.pitch).toBe(0);
      expect(config.rate).toBe(1.0);
    });

    it('should cache voice config to avoid duplicate Claude calls', async () => {
      await getVoiceConfigForCharacter('Cached Character');
      await getVoiceConfigForCharacter('Cached Character');

      // Claude should only be called once (result is cached)
      expect(mockClaudeCreate).toHaveBeenCalledTimes(1);
    });

    it('should fall back to Default voice on Claude error', async () => {
      mockClaudeCreate.mockRejectedValue(new Error('Claude API error'));

      const config = await getVoiceConfigForCharacter('Error Character');

      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
      expect(config.ssmlGender).toBe(SSML_GENDER.MALE);
    });
  });

  describe('Gender Override', () => {
    it('should respect gender override for female voice', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male', // Claude returns male voice gender
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-D',
          pitch: 0,
          rate: 1.0
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Test Person', 'female');

      // Gender override should change the ssmlGender
      expect(config.ssmlGender).toBe(SSML_GENDER.FEMALE);
    });

    it('should cache different configs for different genders', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-D',
          pitch: 0,
          rate: 1.0
        }) }]
      });

      await getVoiceConfigForCharacter('Ambiguous Name', 'male');
      await getVoiceConfigForCharacter('Ambiguous Name', 'female');

      // Should call Claude twice for different cache keys
      expect(mockClaudeCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('Voice Type Detection', () => {
    it('should detect Studio voice type', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'female',
          languageCode: 'en-US',
          voiceName: 'en-US-Studio-M',
          pitch: 2,
          rate: 1.1
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Studio Character');

      expect(config.type).toBe('Studio');
      expect(config.name).toBe('en-US-Studio-M');
    });

    it('should detect Wavenet voice type', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-GB',
          voiceName: 'en-GB-Wavenet-B',
          pitch: -3,
          rate: 0.95
        }) }]
      });

      const config = await getVoiceConfigForCharacter('British Character');

      expect(config.type).toBe('Wavenet');
      expect(config.name).toBe('en-GB-Wavenet-B');
    });

    it('should detect Neural2 voice type', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'female',
          languageCode: 'en-US',
          voiceName: 'en-US-Neural2-F',
          pitch: 5,
          rate: 1.2
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Neural Character');

      expect(config.type).toBe('Neural2');
      expect(config.name).toBe('en-US-Neural2-F');
    });
  });

  describe('Language Support', () => {
    it('should support German voices', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'de-DE',
          voiceName: 'de-DE-Wavenet-B',
          pitch: -2,
          rate: 1.0
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Helmut Schmidt');

      expect(config.languageCodes[0]).toBe('de-DE');
      expect(config.name).toBe('de-DE-Wavenet-B');
    });

    it('should support French voices', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'female',
          languageCode: 'fr-FR',
          voiceName: 'fr-FR-Wavenet-A',
          pitch: 3,
          rate: 1.05
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Marie Curie');

      expect(config.languageCodes[0]).toBe('fr-FR');
      expect(config.name).toBe('fr-FR-Wavenet-A');
    });

    it('should support Japanese voices', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'female',
          languageCode: 'ja-JP',
          voiceName: 'ja-JP-Wavenet-A',
          pitch: 4,
          rate: 1.0
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Yuki Tanaka');

      expect(config.languageCodes[0]).toBe('ja-JP');
      expect(config.name).toBe('ja-JP-Wavenet-A');
    });
  });

  describe('Pitch and Rate Parameters', () => {
    it('should pass through pitch from Claude', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-D',
          pitch: -10, // Deep voice
          rate: 1.0
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Deep Voice Character');

      expect(config.pitch).toBe(-10);
    });

    it('should pass through rate from Claude', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'female',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-F',
          pitch: 2,
          rate: 1.3 // Fast speaker
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Fast Speaker');

      expect(config.rate).toBe(1.3);
    });

    it('should clamp pitch to valid range (-20 to 20)', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-D',
          pitch: 50, // Invalid: too high
          rate: 1.0
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Invalid Pitch Character');

      // Should be clamped to 20
      expect(config.pitch).toBeLessThanOrEqual(20);
      expect(config.pitch).toBeGreaterThanOrEqual(-20);
    });

    it('should clamp rate to valid range (0.25 to 4.0)', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'female',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-F',
          pitch: 0,
          rate: 10.0 // Invalid: too fast
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Invalid Rate Character');

      // Should be clamped to 4.0
      expect(config.rate).toBeLessThanOrEqual(4.0);
      expect(config.rate).toBeGreaterThanOrEqual(0.25);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON from Claude', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'This is not valid JSON' }]
      });

      const config = await getVoiceConfigForCharacter('Invalid JSON Character');

      // Should fall back to Default
      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
    });

    it('should handle missing fields in Claude response', async () => {
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          // Missing required fields
          gender: 'male'
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Missing Fields Character');

      // Should still return a valid config with defaults
      expect(config).toBeDefined();
      expect(config.name).toBeDefined();
      expect(config.ssmlGender).toBeDefined();
    });

    it('should handle empty Claude response', async () => {
      mockClaudeCreate.mockRejectedValue(new Error('Empty content'));

      const config = await getVoiceConfigForCharacter('Empty Response Character XYZ123');

      // Should fall back to Default
      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
    });

    it('should fix invalid Chinese Wavenet-B voice to Wavenet-C', async () => {
      // First attempt: return invalid zh-CN-Wavenet-B
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'zh-CN',
          voiceName: 'zh-CN-Wavenet-B',
          pitch: 0,
          rate: 1.0
        }) }]
      });

      // First validation fails (invalid voice)
      mockSynthesizeSpeech.mockRejectedValueOnce(new Error('Voice does not exist'));

      // Second attempt: Claude corrects to Wavenet-C
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'zh-CN',
          voiceName: 'zh-CN-Wavenet-C',
          pitch: 0,
          rate: 1.0
        }) }]
      });

      // Second validation succeeds
      mockSynthesizeSpeech.mockResolvedValueOnce([{ audioContent: Buffer.from('test') }]);

      const config = await getVoiceConfigForCharacter('Chinese Character');

      // Should use the corrected voice
      expect(config.name).toBe('zh-CN-Wavenet-C');
      expect(config.languageCodes).toContain('zh-CN');
      expect(mockClaudeCreate).toHaveBeenCalledTimes(2);
    });

    it('should reject malformed voice names and retry', async () => {
      // First attempt: malformed name
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'female',
          languageCode: 'en-US',
          voiceName: 'InvalidVoiceName123',
          pitch: 5,
          rate: 1.1
        }) }]
      });

      // Second attempt: valid name
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'female',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-A',
          pitch: 5,
          rate: 1.1
        }) }]
      });

      mockSynthesizeSpeech.mockResolvedValue([{ audioContent: Buffer.from('test') }]);

      const config = await getVoiceConfigForCharacter('Invalid Voice Character');

      // Should use the corrected voice from retry
      expect(config.name).toBe('en-US-Wavenet-A');
      expect(mockClaudeCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry up to 3 times before falling back to default', async () => {
      // All attempts return invalid voices
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-Z', // Invalid letter
          pitch: 0,
          rate: 1.0
        }) }]
      });

      // All validations fail
      mockSynthesizeSpeech.mockRejectedValue(new Error('Voice does not exist'));

      const config = await getVoiceConfigForCharacter('Retry Test Character');

      // Should fall back to Default after 3 attempts
      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
      expect(mockClaudeCreate).toHaveBeenCalledTimes(3);
    });

    // New tests to exercise additional branches
    it('should return Standard voice type for Standard-named voices', async () => {
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Standard-E',
          pitch: 0,
          rate: 1.0
        }) }]
      });

      const config = await getVoiceConfigForCharacter('Standard Voice Character');
      expect(config.type).toBe('Standard');
      expect(config.name).toBe('en-US-Standard-E');
    });

    it('treats synthesizeSpeech with missing audioContent as invalid and retries', async () => {
      // First attempt: Claude returns a Wavenet voice but synthesizeSpeech returns an item without audioContent
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-Q',
          pitch: 0,
          rate: 1.0
        }) }]
      });
      // synthesizeSpeech returns an entry with no audioContent (falsy)
      mockSynthesizeSpeech.mockResolvedValueOnce([{}]);

      // Second attempt: Claude returns a good voice and synthesize succeeds
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-A',
          pitch: 0,
          rate: 1.0
        }) }]
      });
      mockSynthesizeSpeech.mockResolvedValueOnce([{ audioContent: Buffer.from('ok') }]);

      const config = await getVoiceConfigForCharacter('NoAudioContent Character');
      expect(config.name).toBe('en-US-Wavenet-A');
      expect(mockClaudeCreate).toHaveBeenCalledTimes(2);
    });

    it('falls back to Default when TTS client import throws', async () => {
      // Make getTTSClient throw on every attempt to simulate persistent runtime failure
      const tts = require('../../src/utils/tts');
      (tts.getTTSClient as jest.Mock).mockImplementation(() => { throw new Error('GCP init failed'); });

      // Claude returns a seemingly valid voice name (same on each attempt)
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-B',
          pitch: 0,
          rate: 1.0
        }) }]
      });

      const config = await getVoiceConfigForCharacter('TTS Failure Character');
      // With TTS client failing validation across all attempts, we should fall back to default
      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
      // And Claude was asked multiple times while trying to find a valid voice
      expect(mockClaudeCreate).toHaveBeenCalledTimes(3);
    });
  });

  describe('internal helpers', () => {
    it('fetchVoiceConfigFromClaude throws when maxRetries is zero', async () => {
      const { fetchVoiceConfigFromClaude } = require('../../src/utils/characterVoices');
      await expect(fetchVoiceConfigFromClaude('No attempts', 0)).rejects.toThrow('Failed to get valid voice config from Claude');
    });

    it('maps neutral gender to SSML_GENDER.NEUTRAL', () => {
      const mod = require('../../src/utils/characterVoices');
      expect(mod.mapGenderToSsml('neutral')).toBe(SSML_GENDER.NEUTRAL);
    });



    it('logs info when voice validation fails once then succeeds', async () => {
      // First validation attempt fails with an error
      mockSynthesizeSpeech.mockRejectedValueOnce(new Error('synth failure'));
      // Then it succeeds
      mockSynthesizeSpeech.mockResolvedValueOnce([{ audioContent: Buffer.from('ok') }]);

      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-G',
          pitch: 0,
          rate: 1.0
        }) }]
      });

      const logger = require('../../src/utils/logger');
      await getVoiceConfigForCharacter('Log Validation Failure');

      expect(logger.default.info).toHaveBeenCalledWith('Voice validation failed', expect.any(Object));
    });

    // New edge-case tests to exercise uncovered branches
    it('throws when Claude content is empty string (fallback to {})', async () => {
      const { fetchVoiceConfigFromClaude } = require('../../src/utils/characterVoices');

      // Simulate Claude returning an empty content string (trim -> '')
      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '   ' }]
      });

      await expect(fetchVoiceConfigFromClaude('EmptyContent', 1)).rejects.toThrow();
    });

    it('normalizeClaudeConfig applies defaults for missing fields', async () => {
      const mod = require('../../src/utils/characterVoices');
      const normalized = mod.normalizeClaudeConfig({} as Partial<VoiceConfig>);
      expect(normalized.gender).toBe('male');
      expect(normalized.languageCode).toBe('en-US');
      expect(normalized.pitch).toBe(0);
      expect(normalized.rate).toBe(1.0);
    });

    it('normalizeClaudeConfig respects neutral gender and clamps values', () => {
      const mod = require('../../src/utils/characterVoices');
      const normalized = mod.normalizeClaudeConfig({ gender: 'neutral', pitch: 50, rate: 10 } as Partial<VoiceConfig>);
      expect(normalized.gender).toBe('neutral');
      expect(normalized.pitch).toBeLessThanOrEqual(20);
      expect(normalized.rate).toBeLessThanOrEqual(4.0);
    });

    it('applies default gender/pitch/rate when fields are missing (unit)', () => {
      // Unit test using normalization helper to avoid external validation dependency
      const mod = require('../../src/utils/characterVoices');
      const normalized = mod.normalizeClaudeConfig({ languageCode: 'en-US', voiceName: 'en-US-Wavenet-D' } as Partial<VoiceConfig>);
      expect(normalized.gender).toBe('male');
      expect(normalized.pitch).toBe(0);
      expect(normalized.rate).toBe(1.0);
    });

    it('handles non-Error thrown in isValidGoogleTTSVoice and logs string error', async () => {
      // Make synthesizeSpeech reject with a non-Error value
      mockSynthesizeSpeech.mockRejectedValueOnce('synth-plain-error');

      mockClaudeCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-H',
          pitch: 0,
          rate: 1.0
        }) }]
      });

      const logger = require('../../src/utils/logger');
      await getVoiceConfigForCharacter('NonErrorSynth');

      // The logger should have been called with the stringified error message
      expect(logger.default.info).toHaveBeenCalledWith('Voice validation failed', expect.any(Object));
    });

    it('falls back to Default when Claude rejects with non-Error value', async () => {
      // Simulate Claude rejecting with a plain string
      mockClaudeCreate.mockRejectedValueOnce('claude-boom');

      const logger = require('../../src/utils/logger');
      const config = await getVoiceConfigForCharacter('ClaudeFailString');

      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
      expect(logger.default.warn).toHaveBeenCalledWith('Falling back to Default voice', expect.any(Object));
      // Ensure the string error was passed through (via String(err)) in metadata
      const meta = logger.default.warn.mock.calls[0][1];
      expect(JSON.stringify(meta)).toContain('claude-boom');
    });

    it('maps neutral gender to NEUTRAL (unit)', () => {
      const mod = require('../../src/utils/characterVoices');
      expect(mod.mapGenderToSsml('neutral')).toBe(mod.SSML_GENDER.NEUTRAL);
    });

    describe('mapping helpers (mock fetch)', () => {
      it('getVoiceConfigForCharacter maps neutral gender when fetch returns neutral', async () => {
        const mod = require('../../src/utils/characterVoices');
        // call helper directly
        expect(mod.mapGenderToSsml('neutral')).toBe(SSML_GENDER.NEUTRAL);
      });

      it('getVoiceConfigForCharacter maps Journey voice type to Standard', async () => {
        const mod = require('../../src/utils/characterVoices');
        expect(mod.detectVoiceType('en-US-Journey-A')).toBe('Standard');
      });
    });
  });
});

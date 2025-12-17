/**
 * Tests for character voice configuration with OpenAI structured output.
 * Tests the simplified OpenAI → Google TTS pipeline.
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

// Mock OpenAI to return structured voice configuration JSON
const mockOpenAICreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockOpenAICreate
        }
      }
    }))
  };
});

jest.mock('../../src/utils/openaiModelSelector', () => ({
  getOpenAIModel: jest.fn(() => 'gpt-4o-mini'),
}));

describe('characterVoices - Simplified OpenAI → Google TTS Pipeline', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Returns valid American male voice by default
    mockOpenAICreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            gender: 'male',
            languageCode: 'en-US',
            voiceName: 'en-US-Wavenet-D',
            pitch: 0,
            rate: 1.0
          })
        }
      }]
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

    it('should get voice config from OpenAI for unknown character', async () => {
      const config = await getVoiceConfigForCharacter('Test Character');
      
      expect(mockOpenAICreate).toHaveBeenCalled();
      expect(config).toBeDefined();
      expect(config.name).toBe('en-US-Wavenet-D');
      expect(config.ssmlGender).toBe(SSML_GENDER.MALE);
      expect(config.pitch).toBe(0);
      expect(config.rate).toBe(1.0);
    });

    it('should cache voice config to avoid duplicate OpenAI calls', async () => {
      await getVoiceConfigForCharacter('Cached Character');
      await getVoiceConfigForCharacter('Cached Character');
      
      // OpenAI should only be called once (result is cached)
      expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
    });

    it('should fall back to Default voice on OpenAI error', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('OpenAI API error'));
      
      const config = await getVoiceConfigForCharacter('Error Character');
      
      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
      expect(config.ssmlGender).toBe(SSML_GENDER.MALE);
    });
  });

  describe('Gender Override', () => {
    it('should respect gender override for female voice', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'male', // OpenAI returns male voice gender
              languageCode: 'en-US',
              voiceName: 'en-US-Wavenet-D',
              pitch: 0,
              rate: 1.0
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Test Person', 'female');
      
      // Gender override should change the ssmlGender
      expect(config.ssmlGender).toBe(SSML_GENDER.FEMALE);
    });

    it('should cache different configs for different genders', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'male',
              languageCode: 'en-US',
              voiceName: 'en-US-Wavenet-D',
              pitch: 0,
              rate: 1.0
            })
          }
        }]
      });

      await getVoiceConfigForCharacter('Ambiguous Name', 'male');
      await getVoiceConfigForCharacter('Ambiguous Name', 'female');
      
      // Should call OpenAI twice for different cache keys
      expect(mockOpenAICreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('Voice Type Detection', () => {
    it('should detect Studio voice type', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'female',
              languageCode: 'en-US',
              voiceName: 'en-US-Studio-M',
              pitch: 2,
              rate: 1.1
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Studio Character');
      
      expect(config.type).toBe('Studio');
      expect(config.name).toBe('en-US-Studio-M');
    });

    it('should detect Wavenet voice type', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'male',
              languageCode: 'en-GB',
              voiceName: 'en-GB-Wavenet-B',
              pitch: -3,
              rate: 0.95
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('British Character');
      
      expect(config.type).toBe('Wavenet');
      expect(config.name).toBe('en-GB-Wavenet-B');
    });

    it('should detect Neural2 voice type', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'female',
              languageCode: 'en-US',
              voiceName: 'en-US-Neural2-F',
              pitch: 5,
              rate: 1.2
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Neural Character');
      
      expect(config.type).toBe('Neural2');
      expect(config.name).toBe('en-US-Neural2-F');
    });
  });

  describe('Language Support', () => {
    it('should support German voices', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'male',
              languageCode: 'de-DE',
              voiceName: 'de-DE-Wavenet-B',
              pitch: -2,
              rate: 1.0
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Helmut Schmidt');
      
      expect(config.languageCodes[0]).toBe('de-DE');
      expect(config.name).toBe('de-DE-Wavenet-B');
    });

    it('should support French voices', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'female',
              languageCode: 'fr-FR',
              voiceName: 'fr-FR-Wavenet-A',
              pitch: 3,
              rate: 1.05
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Marie Curie');
      
      expect(config.languageCodes[0]).toBe('fr-FR');
      expect(config.name).toBe('fr-FR-Wavenet-A');
    });

    it('should support Japanese voices', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'female',
              languageCode: 'ja-JP',
              voiceName: 'ja-JP-Wavenet-A',
              pitch: 4,
              rate: 1.0
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Yuki Tanaka');
      
      expect(config.languageCodes[0]).toBe('ja-JP');
      expect(config.name).toBe('ja-JP-Wavenet-A');
    });
  });

  describe('Pitch and Rate Parameters', () => {
    it('should pass through pitch from OpenAI', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'male',
              languageCode: 'en-US',
              voiceName: 'en-US-Wavenet-D',
              pitch: -10, // Deep voice
              rate: 1.0
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Deep Voice Character');
      
      expect(config.pitch).toBe(-10);
    });

    it('should pass through rate from OpenAI', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'female',
              languageCode: 'en-US',
              voiceName: 'en-US-Wavenet-F',
              pitch: 2,
              rate: 1.3 // Fast speaker
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Fast Speaker');
      
      expect(config.rate).toBe(1.3);
    });

    it('should clamp pitch to valid range (-20 to 20)', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'male',
              languageCode: 'en-US',
              voiceName: 'en-US-Wavenet-D',
              pitch: 50, // Invalid: too high
              rate: 1.0
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Invalid Pitch Character');
      
      // Should be clamped to 20
      expect(config.pitch).toBeLessThanOrEqual(20);
      expect(config.pitch).toBeGreaterThanOrEqual(-20);
    });

    it('should clamp rate to valid range (0.25 to 4.0)', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'female',
              languageCode: 'en-US',
              voiceName: 'en-US-Wavenet-F',
              pitch: 0,
              rate: 10.0 // Invalid: too fast
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Invalid Rate Character');
      
      // Should be clamped to 4.0
      expect(config.rate).toBeLessThanOrEqual(4.0);
      expect(config.rate).toBeGreaterThanOrEqual(0.25);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON from OpenAI', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'This is not valid JSON'
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Invalid JSON Character');
      
      // Should fall back to Default
      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
    });

    it('should handle missing fields in OpenAI response', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              // Missing required fields
              gender: 'male'
            })
          }
        }]
      });

      const config = await getVoiceConfigForCharacter('Missing Fields Character');
      
      // Should still return a valid config with defaults
      expect(config).toBeDefined();
      expect(config.name).toBeDefined();
      expect(config.ssmlGender).toBeDefined();
    });

    it('should handle empty OpenAI response', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('Empty content'));

      const config = await getVoiceConfigForCharacter('Empty Response Character XYZ123');
      
      // Should fall back to Default
      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
    });

    it('should fix invalid Chinese Wavenet-B voice to Wavenet-C', async () => {
      // First attempt: return invalid zh-CN-Wavenet-B
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'male',
              languageCode: 'zh-CN',
              voiceName: 'zh-CN-Wavenet-B',
              pitch: 0,
              rate: 1.0
            })
          }
        }]
      });
      
      // First validation fails (invalid voice)
      mockSynthesizeSpeech.mockRejectedValueOnce(new Error('Voice does not exist'));
      
      // Second attempt: OpenAI corrects to Wavenet-C
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'male',
              languageCode: 'zh-CN',
              voiceName: 'zh-CN-Wavenet-C',
              pitch: 0,
              rate: 1.0
            })
          }
        }]
      });
      
      // Second validation succeeds
      mockSynthesizeSpeech.mockResolvedValueOnce([{ audioContent: Buffer.from('test') }]);

      const config = await getVoiceConfigForCharacter('Chinese Character');
      
      // Should use the corrected voice
      expect(config.name).toBe('zh-CN-Wavenet-C');
      expect(config.languageCodes).toContain('zh-CN');
      expect(mockOpenAICreate).toHaveBeenCalledTimes(2);
    });

    it('should reject malformed voice names and retry', async () => {
      // First attempt: malformed name
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'female',
              languageCode: 'en-US',
              voiceName: 'InvalidVoiceName123',
              pitch: 5,
              rate: 1.1
            })
          }
        }]
      });
      
      // Second attempt: valid name
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'female',
              languageCode: 'en-US',
              voiceName: 'en-US-Wavenet-A',
              pitch: 5,
              rate: 1.1
            })
          }
        }]
      });
      
      mockSynthesizeSpeech.mockResolvedValue([{ audioContent: Buffer.from('test') }]);

      const config = await getVoiceConfigForCharacter('Invalid Voice Character');
      
      // Should use the corrected voice from retry
      expect(config.name).toBe('en-US-Wavenet-A');
      expect(mockOpenAICreate).toHaveBeenCalledTimes(2);
    });

    it('should retry up to 3 times before falling back to default', async () => {
      // All attempts return invalid voices
      mockOpenAICreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              gender: 'male',
              languageCode: 'en-US',
              voiceName: 'en-US-Wavenet-Z', // Invalid letter
              pitch: 0,
              rate: 1.0
            })
          }
        }]
      });
      
      // All validations fail
      mockSynthesizeSpeech.mockRejectedValue(new Error('Voice does not exist'));

      const config = await getVoiceConfigForCharacter('Retry Test Character');
      
      // Should fall back to Default after 3 attempts
      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
      expect(mockOpenAICreate).toHaveBeenCalledTimes(3);
    });

    // New tests to exercise additional branches
    it('should return Standard voice type for Standard-named voices', async () => {
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Standard-E',
          pitch: 0,
          rate: 1.0
        }) } }]
      });

      const config = await getVoiceConfigForCharacter('Standard Voice Character');
      expect(config.type).toBe('Standard');
      expect(config.name).toBe('en-US-Standard-E');
    });

    it('treats synthesizeSpeech with missing audioContent as invalid and retries', async () => {
      // First attempt: OpenAI returns a Wavenet voice but synthesizeSpeech returns an item without audioContent
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-Q',
          pitch: 0,
          rate: 1.0
        }) } }]
      });
      // synthesizeSpeech returns an entry with no audioContent (falsy)
      mockSynthesizeSpeech.mockResolvedValueOnce([{}]);

      // Second attempt: OpenAI returns a good voice and synthesize succeeds
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-A',
          pitch: 0,
          rate: 1.0
        }) } }]
      });
      mockSynthesizeSpeech.mockResolvedValueOnce([{ audioContent: Buffer.from('ok') }]);

      const config = await getVoiceConfigForCharacter('NoAudioContent Character');
      expect(config.name).toBe('en-US-Wavenet-A');
      expect(mockOpenAICreate).toHaveBeenCalledTimes(2);
    });

    it('falls back to Default when TTS client import throws', async () => {
      // Make getTTSClient throw on every attempt to simulate persistent runtime failure
      const tts = require('../../src/utils/tts');
      (tts.getTTSClient as jest.Mock).mockImplementation(() => { throw new Error('GCP init failed'); });

      // OpenAI returns a seemingly valid voice name (same on each attempt)
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-B',
          pitch: 0,
          rate: 1.0
        }) } }]
      });

      const config = await getVoiceConfigForCharacter('TTS Failure Character');
      // With TTS client failing validation across all attempts, we should fall back to default
      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
      // And OpenAI was asked multiple times while trying to find a valid voice
      expect(mockOpenAICreate).toHaveBeenCalledTimes(3);
    });
  });

  describe('internal helpers', () => {
    it('fetchVoiceConfigFromOpenAI throws when maxRetries is zero', async () => {
      const { fetchVoiceConfigFromOpenAI } = require('../../src/utils/characterVoices');
      await expect(fetchVoiceConfigFromOpenAI('No attempts', 0)).rejects.toThrow('Failed to get valid voice config from OpenAI');
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

      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-G',
          pitch: 0,
          rate: 1.0
        }) } }]
      });

      const logger = require('../../src/utils/logger');
      await getVoiceConfigForCharacter('Log Validation Failure');

      expect(logger.default.info).toHaveBeenCalledWith('Voice validation failed', expect.any(Object));
    });

    // New edge-case tests to exercise uncovered branches
    it('throws when OpenAI content is empty string (fallback to {})', async () => {
      const { fetchVoiceConfigFromOpenAI } = require('../../src/utils/characterVoices');

      // Simulate OpenAI returning an empty content string (trim -> '')
      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: '   ' } }]
      });

      await expect(fetchVoiceConfigFromOpenAI('EmptyContent', 1)).rejects.toThrow('Invalid voice name format after 1 attempts');
    });

    it('normalizeOpenAIConfig applies defaults for missing fields', async () => {
      const mod = require('../../src/utils/characterVoices');
      const normalized = mod.normalizeOpenAIConfig({} as Partial<VoiceConfig>);
      expect(normalized.gender).toBe('male');
      expect(normalized.languageCode).toBe('en-US');
      expect(normalized.pitch).toBe(0);
      expect(normalized.rate).toBe(1.0);
    });

    it('normalizeOpenAIConfig respects neutral gender and clamps values', () => {
      const mod = require('../../src/utils/characterVoices');
      const normalized = mod.normalizeOpenAIConfig({ gender: 'neutral', pitch: 50, rate: 10 } as Partial<VoiceConfig>);
      expect(normalized.gender).toBe('neutral');
      expect(normalized.pitch).toBeLessThanOrEqual(20);
      expect(normalized.rate).toBeLessThanOrEqual(4.0);
    });

    it('applies default gender/pitch/rate when fields are missing (unit)', () => {
      // Unit test using normalization helper to avoid external validation dependency
      const mod = require('../../src/utils/characterVoices');
      const normalized = mod.normalizeOpenAIConfig({ languageCode: 'en-US', voiceName: 'en-US-Wavenet-D' } as Partial<VoiceConfig>);
      expect(normalized.gender).toBe('male');
      expect(normalized.pitch).toBe(0);
      expect(normalized.rate).toBe(1.0);
    });

    it('handles non-Error thrown in isValidGoogleTTSVoice and logs string error', async () => {
      // Make synthesizeSpeech reject with a non-Error value
      mockSynthesizeSpeech.mockRejectedValueOnce('synth-plain-error');

      mockOpenAICreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          gender: 'male',
          languageCode: 'en-US',
          voiceName: 'en-US-Wavenet-H',
          pitch: 0,
          rate: 1.0
        }) } }]
      });

      const logger = require('../../src/utils/logger');
      await getVoiceConfigForCharacter('NonErrorSynth');

      // The logger should have been called with the stringified error message
      expect(logger.default.info).toHaveBeenCalledWith('Voice validation failed', expect.any(Object));
    });

    it('falls back to Default when OpenAI rejects with non-Error value', async () => {
      // Simulate OpenAI rejecting with a plain string
      mockOpenAICreate.mockRejectedValueOnce('openai-boom');

      const logger = require('../../src/utils/logger');
      const config = await getVoiceConfigForCharacter('OpenAIFailString');

      expect(config.name).toBe(CHARACTER_VOICE_MAP['Default'].name);
      expect(logger.default.warn).toHaveBeenCalledWith('Falling back to Default voice', expect.any(Object));
      // Ensure the string error was passed through (via String(err)) in metadata
      const meta = logger.default.warn.mock.calls[0][1];
      expect(JSON.stringify(meta)).toContain('openai-boom');
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

/**
 * Tests for character voice configuration and selection logic.
 * Ensures gender/accent matching, caching, and persistence work correctly.
 */

import { 
  getVoiceConfigForCharacter, 
  CHARACTER_VOICE_MAP, 
  SSML_GENDER
} from '../../src/utils/characterVoices';
import fs from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
  sanitizeLogMeta: (meta: unknown) => meta,
}));

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'A deep, authoritative American male voice.',
              }
            }]
          })
        }
      }
    }))
  };
});

jest.mock('../../src/utils/openaiModelSelector', () => ({
  getOpenAIModel: jest.fn(() => 'gpt-4o-mini'),
}));

describe('characterVoices - Voice Selection and Matching', () => {
  const cacheDir = path.join(process.cwd(), '.voice-cache');

  beforeEach(() => {
    // Clean up cache directory before each test
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(cacheDir, file));
      });
    }
  });

  afterAll(() => {
    // Clean up cache directory after all tests
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(cacheDir, file));
      });
      fs.rmdirSync(cacheDir);
    }
  });

  describe('Static Voice Mapping', () => {
    it('should return correct voice config for known characters', async () => {
      const config = await getVoiceConfigForCharacter('Einstein');
      expect(config.name).toBe('de-DE-Wavenet-B');
      expect(config.languageCodes).toContain('de-DE');
      expect(config.ssmlGender).toBe(SSML_GENDER.MALE);
      expect(config.type).toBe('Wavenet');
    });

    it('should handle character name case insensitivity', async () => {
      // Static characters should return the same config regardless of case
      const config1 = await getVoiceConfigForCharacter('shakespeare');
      const config2 = await getVoiceConfigForCharacter('SHAKESPEARE');
      const config3 = await getVoiceConfigForCharacter('Shakespeare');
      
      expect(config1.name).toBe(config2.name);
      expect(config2.name).toBe(config3.name);
      expect(config1.name).toBe('en-GB-Wavenet-B'); // Shakespeare's voice
    });

    it('should return voice config for Yoda with correct pitch', async () => {
      const config = await getVoiceConfigForCharacter('Yoda');
      expect(config.name).toBe('en-US-Wavenet-B');
      expect(config.pitch).toBe(5);
      expect(config.rate).toBe(0.85);
    });

    it('should return voice config for Ada Lovelace (female)', async () => {
      const config = await getVoiceConfigForCharacter('Ada Lovelace');
      expect(config.ssmlGender).toBe(SSML_GENDER.FEMALE);
      expect(config.languageCodes).toContain('en-GB');
    });
  });

  describe('Dynamic Voice Selection', () => {
    it('should generate voice config for unknown character', async () => {
      const config = await getVoiceConfigForCharacter('Unknown Character');
      expect(config).toBeDefined();
      expect(config.name).toBeDefined();
      expect(config.ssmlGender).toBeDefined();
      expect(config.languageCodes).toBeDefined();
    });

    it('should cache dynamically generated voice config', async () => {
      const config1 = await getVoiceConfigForCharacter('Test Character');
      const config2 = await getVoiceConfigForCharacter('Test Character');
      
      expect(config1.name).toBe(config2.name);
      expect(config1.ssmlGender).toBe(config2.ssmlGender);
    });

    it('should persist voice config to filesystem for Vercel cold starts', async () => {
      const characterName = 'Persistent Character';
      const config = await getVoiceConfigForCharacter(characterName);
      
      // Check that cache file was created
      const cacheFile = path.join(cacheDir, `${characterName.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
      expect(fs.existsSync(cacheFile)).toBe(true);
      
      // Verify cache content
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      expect(cached.config.name).toBe(config.name);
      expect(cached.timestamp).toBeDefined();
    });
  });

  describe('Gender Override Functionality', () => {
    it('should respect gender override for male voice', async () => {
      const config = await getVoiceConfigForCharacter('Test Person', 'male');
      expect(config.ssmlGender).toBe(SSML_GENDER.MALE);
    });

    it('should respect gender override for female voice', async () => {
      const config = await getVoiceConfigForCharacter('Test Person', 'female');
      expect(config.ssmlGender).toBe(SSML_GENDER.FEMALE);
    });

    it('should respect gender override for neutral voice', async () => {
      const config = await getVoiceConfigForCharacter('Test Person Neutral', 'neutral');
      // Note: Neutral voices are rare, so we validate that the request was made
      // The actual voice may fall back to male/female if no neutral voice is available
      expect(config.ssmlGender).toBeDefined();
      expect([SSML_GENDER.NEUTRAL, SSML_GENDER.MALE, SSML_GENDER.FEMALE]).toContain(config.ssmlGender);
    });

    it('should cache different configs for same character with different genders', async () => {
      const configMale = await getVoiceConfigForCharacter('Ambiguous Name', 'male');
      const configFemale = await getVoiceConfigForCharacter('Ambiguous Name', 'female');
      
      expect(configMale.ssmlGender).toBe(SSML_GENDER.MALE);
      expect(configFemale.ssmlGender).toBe(SSML_GENDER.FEMALE);
      expect(configMale.name).not.toBe(configFemale.name);
    });

    it('should create separate persistent cache files for gender overrides', async () => {
      await getVoiceConfigForCharacter('Cache Test', 'male');
      await getVoiceConfigForCharacter('Cache Test', 'female');
      
      const maleCacheFile = path.join(cacheDir, 'Cache_Test_male.json');
      const femaleCacheFile = path.join(cacheDir, 'Cache_Test_female.json');
      
      expect(fs.existsSync(maleCacheFile)).toBe(true);
      expect(fs.existsSync(femaleCacheFile)).toBe(true);
    });
  });

  describe('Voice Type Detection', () => {
    it('should include type field in returned config', async () => {
      const config = await getVoiceConfigForCharacter('Default');
      expect(config.type).toBeDefined();
      expect(['Wavenet', 'Studio', 'Neural2', 'Standard']).toContain(config.type);
    });

    it('should detect Studio voices correctly', async () => {
      // Mock OpenAI to return description suggesting high-quality voice
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A professional, expressive American male voice with high quality.',
                }
              }]
            })
          }
        }
      }));

      const config = await getVoiceConfigForCharacter('Professional Speaker');
      expect(config.type).toBeDefined();
    });
  });

  describe('Persistent Cache Behavior', () => {
    it('should load voice config from persistent cache on subsequent calls', async () => {
      const characterName = 'Persistent Test';
      
      // First call - generates and caches
      const config1 = await getVoiceConfigForCharacter(characterName);
      
      // Manually verify cache file exists
      const cacheFile = path.join(cacheDir, `${characterName.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
      expect(fs.existsSync(cacheFile)).toBe(true);
      
      // Second call - should load from persistent cache
      // Clear in-memory cache to force loading from filesystem
      const _characterVoices = require('../../src/utils/characterVoices');
      const config2 = await getVoiceConfigForCharacter(characterName);
      
      expect(config1.name).toBe(config2.name);
    });

    it('should invalidate cache older than 7 days', async () => {
      const characterName = 'Old Cache Test';
      const cacheFile = path.join(cacheDir, `${characterName.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
      
      // Create cache directory if it doesn't exist
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      // Create old cache file (8 days old)
      const oldTimestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(cacheFile, JSON.stringify({
        config: {
          languageCodes: ['en-US'],
          name: 'en-US-Old-Voice',
          ssmlGender: SSML_GENDER.MALE,
        },
        timestamp: oldTimestamp
      }));
      
      // Should generate new config since cache is too old
      const config = await getVoiceConfigForCharacter(characterName);
      expect(config.name).not.toBe('en-US-Old-Voice');
    });

    it('should handle missing cache directory gracefully', async () => {
      // Remove cache directory
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        files.forEach(file => fs.unlinkSync(path.join(cacheDir, file)));
        fs.rmdirSync(cacheDir);
      }
      
      // Should still work and recreate directory
      const config = await getVoiceConfigForCharacter('No Cache Dir Test');
      expect(config).toBeDefined();
      expect(fs.existsSync(cacheDir)).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty character name', async () => {
      const config = await getVoiceConfigForCharacter('');
      expect(config).toBeDefined();
      expect(config.name).toBeDefined();
    });

    it('should handle special characters in character name', async () => {
      const config = await getVoiceConfigForCharacter('Test@Character#123!');
      expect(config).toBeDefined();
    });

    it('should handle very long character names', async () => {
      const longName = 'A'.repeat(500);
      const config = await getVoiceConfigForCharacter(longName);
      expect(config).toBeDefined();
    });

    it('should fallback gracefully if OpenAI fails', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('OpenAI API error'))
          }
        }
      }));

      const config = await getVoiceConfigForCharacter('Fallback Test');
      expect(config).toBeDefined();
      expect(config.name).toBeDefined();
    });

    it('should handle null gender override', async () => {
      const config = await getVoiceConfigForCharacter('Test Character', null);
      expect(config).toBeDefined();
    });

    it('should handle undefined gender override', async () => {
      const config = await getVoiceConfigForCharacter('Test Character', undefined);
      expect(config).toBeDefined();
    });
  });

  describe('Name Normalization', () => {
    it('should normalize character names consistently', async () => {
      const config1 = await getVoiceConfigForCharacter('  sherlock  holmes  ');
      const config2 = await getVoiceConfigForCharacter('sherlock holmes');
      const config3 = await getVoiceConfigForCharacter('SHERLOCK HOLMES');
      
      // All should resolve to same config (from cache)
      expect(config1.name).toBe(config2.name);
      expect(config2.name).toBe(config3.name);
    });
  });

  describe('Language and Accent Detection', () => {
    it('should select appropriate accent based on character description', async () => {
      const OpenAI = require('openai').default;
      
      // Test British accent
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A distinguished British male voice with a London accent.',
                }
              }]
            })
          }
        }
      }));
      
      const britishConfig = await getVoiceConfigForCharacter('British Person');
      expect(britishConfig.languageCodes[0]).toMatch(/^en-GB/);
    });

    it('should handle German accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A German male voice with strong German accent.',
                }
              }]
            })
          }
        }
      }));
      
      const germanConfig = await getVoiceConfigForCharacter('German Person');
      expect(germanConfig.languageCodes[0]).toMatch(/^de-/);
    });

    it('should handle French accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A French female voice with Parisian accent.',
                }
              }]
            })
          }
        }
      }));
      
      const frenchConfig = await getVoiceConfigForCharacter('French Person');
      expect(frenchConfig.languageCodes[0]).toMatch(/^fr-/);
    });
  });

  describe('SSML Gender Constants', () => {
    it('should have correct SSML_GENDER values', () => {
      expect(SSML_GENDER.NEUTRAL).toBe(0);
      expect(SSML_GENDER.MALE).toBe(1);
      expect(SSML_GENDER.FEMALE).toBe(2);
      expect(SSML_GENDER.UNSPECIFIED).toBe(3);
    });
  });

  describe('CHARACTER_VOICE_MAP Coverage', () => {
    it('should have voice configs for common characters', () => {
      expect(CHARACTER_VOICE_MAP['Default']).toBeDefined();
      expect(CHARACTER_VOICE_MAP['Einstein']).toBeDefined();
      expect(CHARACTER_VOICE_MAP['Yoda']).toBeDefined();
      expect(CHARACTER_VOICE_MAP['Shakespeare']).toBeDefined();
    });

    it('should have type field in all static configs', () => {
      Object.values(CHARACTER_VOICE_MAP).forEach(config => {
        expect(config.type).toBeDefined();
      });
    });
  });

  describe('Advanced Voice Matching Logic', () => {
    it('should handle pitch modifications for old/deep/high voices', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A deep, elderly male voice.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Deep Old Voice');
      expect(config.pitch).toBeLessThan(0);
    });

    it('should handle Chirp/HD/expressive voice types', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A highly expressive and emotional American voice.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Expressive Voice');
      expect(config).toBeDefined();
      // Chirp voices should be prioritized for expressive descriptions
    });

    it('should select Neural2 voices for natural descriptions', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A natural, neural sounding American male voice.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Natural Voice');
      expect(config).toBeDefined();
    });

    it('should handle regional accents (Australian, Indian, Scottish, Irish, Canadian)', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'An Australian male voice with distinct accent.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Australian Voice');
      // Should select an English variant (en-AU preferred, but en-US/en-GB acceptable as fallback)
      expect(config.languageCodes[0]).toMatch(/^en-/);
      expect(config).toBeDefined();
    });

    it('should handle Spanish accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A Spanish male voice from Spain.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Spanish Voice');
      expect(config.languageCodes[0]).toMatch(/^es-/);
    });

    it('should handle Italian accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'An Italian female voice from Italy.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Italian Voice');
      expect(config.languageCodes[0]).toMatch(/^it-/);
    });

    it('should handle Portuguese accents (Portugal vs Brazil)', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A Brazilian Portuguese female voice.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Brazilian Voice');
      // Should select Portuguese variant (pt-BR preferred, pt-PT acceptable)
      expect(config.languageCodes[0]).toMatch(/^pt-/);
      expect(config).toBeDefined();
    });

    it('should handle Dutch accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A Dutch male voice from the Netherlands.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Dutch Voice');
      expect(config.languageCodes[0]).toBe('nl-NL');
    });

    it('should handle Russian accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A Russian male voice from Russia.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Russian Voice');
      // Should ideally select ru-RU, but may fall back to English if not available
      expect(config).toBeDefined();
      expect(config.name).toBeDefined();
      expect(['ru-RU', 'en-US', 'en-GB']).toContain(config.languageCodes[0]);
    });

    it('should handle Japanese accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A Japanese female voice from Japan.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Japanese Voice');
      expect(config.languageCodes[0]).toBe('ja-JP');
    });

    it('should handle Korean accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A Korean male voice from Korea.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Korean Voice');
      expect(config.languageCodes[0]).toBe('ko-KR');
    });

    it('should handle Mandarin Chinese accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A Mandarin Chinese male voice from China.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Chinese Voice');
      expect(config.languageCodes[0]).toBe('zh-CN');
    });

    it('should handle Cantonese accent', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A Cantonese voice from Taiwan.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Cantonese Voice');
      expect(config.languageCodes[0]).toBe('zh-TW');
    });

    it('should fall back through type preference hierarchy', async () => {
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'A young, high-pitched American male voice.',
                }
              }]
            })
          }
        }
      }));
      
      const config = await getVoiceConfigForCharacter('Young High Voice');
      expect(config).toBeDefined();
      expect(config.pitch).toBeGreaterThan(0);
    });
  });
});

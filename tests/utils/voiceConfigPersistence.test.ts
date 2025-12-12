import { loadVoiceConfig, persistVoiceConfig, clearVoiceConfig } from '../../src/utils/voiceConfigPersistence';
import storage from '../../src/utils/storage';
import type { CharacterVoiceConfig } from '../../src/utils/characterVoices';

jest.mock('../../src/utils/storage');

const mockStorage = storage as jest.Mocked<typeof storage>;

const createMockConfig = (): CharacterVoiceConfig => ({
  name: 'en-US-Wavenet-A',
  languageCodes: ['en-US'],
  ssmlGender: 1,
  pitch: 0,
  rate: 1.0
});

describe('voiceConfigPersistence', () => {
  let originalDocument: Document | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalDocument = (global as any).document;
    
    // Simple mock document
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).document = { cookie: '' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).btoa = (str: string) => Buffer.from(str).toString('base64');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).atob = (str: string) => Buffer.from(str, 'base64').toString();
  });

  afterEach(() => {
    if (originalDocument === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).document;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).document = originalDocument;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).btoa;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).atob;
  });

  describe('loadVoiceConfig', () => {
    it('returns null for empty botName', () => {
      expect(loadVoiceConfig('')).toBeNull();
    });

    it('loads config from versioned storage', () => {
      const config = createMockConfig();
      mockStorage.getVersionedJSON.mockReturnValue({ 
        v: 1, 
        payload: config,
        createdAt: new Date().toISOString()
      });

      const result = loadVoiceConfig('TestBot');

      expect(result).toEqual(config);
    });

    it('handles storage.getVersionedJSON throwing error', () => {
      mockStorage.getVersionedJSON.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = loadVoiceConfig('TestBot');

      expect(result).toBeNull();
    });

    it('returns null when document is undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).document;
      mockStorage.getVersionedJSON.mockReturnValue(null);

      const result = loadVoiceConfig('TestBot');

      expect(result).toBeNull();
    });
  });

  describe('persistVoiceConfig', () => {
    it('does nothing for empty botName', () => {
      persistVoiceConfig('', createMockConfig());

      expect(mockStorage.setVersionedJSON).not.toHaveBeenCalled();
    });

    it('does nothing for null config', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      persistVoiceConfig('TestBot', null as any);

      expect(mockStorage.setVersionedJSON).not.toHaveBeenCalled();
    });

    it('saves config to storage', () => {
      const config = createMockConfig();

      persistVoiceConfig('TestBot', config);

      expect(mockStorage.setVersionedJSON).toHaveBeenCalledWith('voiceConfig-TestBot', config, 1);
    });

    it('handles storage.setVersionedJSON throwing', () => {
      mockStorage.setVersionedJSON.mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => persistVoiceConfig('TestBot', createMockConfig())).not.toThrow();
    });

    it('handles document being unavailable', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).document;

      expect(() => persistVoiceConfig('TestBot', createMockConfig())).not.toThrow();
      expect(mockStorage.setVersionedJSON).toHaveBeenCalled();
    });

    it('works without btoa function', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).btoa;

      expect(() => persistVoiceConfig('TestBot', createMockConfig())).not.toThrow();
    });

    it('handles JSON.stringify throwing (circular reference)', () => {
      const config = createMockConfig();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any).circular = config;

      expect(() => persistVoiceConfig('TestBot', config)).not.toThrow();
    });
  });

  describe('clearVoiceConfig', () => {
    it('does nothing for empty botName', () => {
      clearVoiceConfig('');

      expect(mockStorage.removeItem).not.toHaveBeenCalled();
    });

    it('removes config from storage', () => {
      clearVoiceConfig('TestBot');

      expect(mockStorage.removeItem).toHaveBeenCalledWith('voiceConfig-TestBot');
    });

    it('handles storage.removeItem throwing', () => {
      mockStorage.removeItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => clearVoiceConfig('TestBot')).not.toThrow();
    });

    it('handles document being unavailable', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).document;

      expect(() => clearVoiceConfig('TestBot')).not.toThrow();
    });
  });
});

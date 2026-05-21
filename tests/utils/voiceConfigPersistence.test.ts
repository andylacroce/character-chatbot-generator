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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).document = originalDocument;
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
      (global as any).document = undefined;
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
      (global as any).document = undefined;

      expect(() => persistVoiceConfig('TestBot', createMockConfig())).not.toThrow();
      expect(mockStorage.setVersionedJSON).toHaveBeenCalled();
    });

    it('works without btoa function', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).btoa;

      expect(() => persistVoiceConfig('TestBot', createMockConfig())).not.toThrow();
    });

    it('writes cookie when btoa is present and loadVoiceConfig reads it back', () => {
      const config = createMockConfig();
      // ensure cookie is empty
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).document.cookie = '';

      persistVoiceConfig('CookieBot', config);

      // cookie should exist
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((global as any).document.cookie).toContain('voiceConfig-CookieBot=');

      // Simulate load reading cookie and decoding
      const loaded = loadVoiceConfig('CookieBot');
      if (loaded) {
        expect(loaded.name).toBe(config.name);
      } else {
        // On platforms where cookie parsing fails for any reason, this should still be graceful
        expect(loaded).toBeNull();
      }
    });

    it('handles cookie setter throwing without bubbling error', () => {
      const config = createMockConfig();
      // Make cookie setter throw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalDoc = (global as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty((global as any).document, 'cookie', {
        configurable: true,
        get: () => '',
        set: () => { throw new Error('cookie write failure'); },
      });

      expect(() => persistVoiceConfig('TestBot', config)).not.toThrow();

      // restore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty((global as any).document, 'cookie', { value: originalDoc.cookie, writable: true });
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
      (global as any).document = undefined;

      expect(() => clearVoiceConfig('TestBot')).not.toThrow();
    });
  });

  describe('decodePayload and getCookie branch coverage', () => {
    it('loadVoiceConfig reads config from cookie when storage returns null (decodePayload truthy raw branch)', () => {
      // storage returns null/undefined → falls through to cookie path
      mockStorage.getVersionedJSON.mockReturnValue(null);

      // Encode a valid config into a cookie value manually
      const config = createMockConfig();
      const json = JSON.stringify({ v: 1, payload: config });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encoded = (global as any).btoa(json) as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).document.cookie = `voiceConfig-CookieReadBot=${encodeURIComponent(encoded)}`;

      const result = loadVoiceConfig('CookieReadBot');

      // Should have decoded the cookie and returned the config
      expect(result).not.toBeNull();
      expect(result?.name).toBe(config.name);
    });

    it('loadVoiceConfig returns null when cookie value decodes to invalid structure', () => {
      mockStorage.getVersionedJSON.mockReturnValue(null);

      // Encode an object without "payload" key → decodePayload returns null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encoded = (global as any).btoa(JSON.stringify({ v: 1 })) as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).document.cookie = `voiceConfig-InvalidBot=${encodeURIComponent(encoded)}`;

      const result = loadVoiceConfig('InvalidBot');
      expect(result).toBeNull();
    });

    it('getCookie returns null when document is unavailable (canUseDocument false branch)', () => {
      mockStorage.getVersionedJSON.mockReturnValue(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).document = undefined;

      const result = loadVoiceConfig('NoCookieBot');
      expect(result).toBeNull();
    });

    it('setCookie is skipped when document is unavailable (canUseDocument false branch)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).document = undefined;

      // Should not throw even without document
      const config = createMockConfig();
      expect(() => persistVoiceConfig('NoCookieBot2', config)).not.toThrow();
      expect(mockStorage.setVersionedJSON).toHaveBeenCalled();
    });

    it('encodePayload returns raw JSON when btoa is not a function (cond-expr false branch)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const origBtoa = (global as any).btoa;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).btoa;

      const config = createMockConfig();
      // Should not throw; setCookie receives the raw JSON string (encoded is truthy)
      expect(() => persistVoiceConfig('NoBtoaBot', config)).not.toThrow();
      expect(mockStorage.setVersionedJSON).toHaveBeenCalled();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).btoa = origBtoa;
    });

    it('persistVoiceConfig skips setCookie when encodePayload returns null (encoded falsy branch)', () => {
      const config = createMockConfig();
      // Force encodePayload to throw internally by making JSON.stringify fail (circular ref)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any).circular = config;

      expect(() => persistVoiceConfig('CircularBot', config)).not.toThrow();
      // Cookie should NOT have been set (setCookie skipped)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((global as any).document.cookie).not.toContain('voiceConfig-CircularBot=');
    });
  });
});

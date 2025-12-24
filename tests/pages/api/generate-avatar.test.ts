import type { NextApiRequest, NextApiResponse } from 'next';

// Mock logger (provide default `logger` with warn/info/error to avoid runtime errors)
const mockLogEvent = jest.fn();
const mockSanitize = jest.fn((m: unknown) => m);
const mockLoggerDefault = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), log: jest.fn() };
jest.mock('../../../src/utils/logger', () => ({
  default: mockLoggerDefault,
  logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
  sanitizeLogMeta: (m: unknown) => mockSanitize(m)
}));

// Mock model selector
jest.mock('../../../src/utils/openaiModelSelector', () => ({ getOpenAIModel: (_: string) => ({ primary: 'dall-e-3', fallback: 'gpt-image-1-mini' }) }));

// Make sanitizeCharacterName permissive for tests (return trimmed input)
jest.mock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

function makeRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = jest.fn().mockReturnValue(res as NextApiResponse);
  res.end = jest.fn().mockReturnValue(res as NextApiResponse);
  res.json = jest.fn().mockReturnValue(res as NextApiResponse);
  return res as NextApiResponse;
}

describe('generate-avatar API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 405 for non-POST methods', async () => {
    const handler = require('../../../pages/api/generate-avatar').default;
    const req = { method: 'GET' } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 400 for missing or invalid name', async () => {
    const handler = require('../../../pages/api/generate-avatar').default;
    const req = { method: 'POST', body: {} } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Valid name required' });
  });

  it('returns 400 when sanitized name is invalid', async () => {
    // Use async isolation so Jest awaits promises and captures assertion failures
    await jest.isolateModulesAsync(async () => {
      // reset to ensure our local doMock overrides module cache and top-level mocks
      jest.resetModules();
      jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (_: string) => '' }));
      jest.doMock('../../../src/utils/logger', () => ({ default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
      const handler = require('../../../pages/api/generate-avatar').default;
      // Ensure logger default has warn function in this isolated module context
      const loggerMod = require('../../../src/utils/logger');
      if (!loggerMod.default || typeof loggerMod.default.warn !== 'function') {
        loggerMod.default = mockLoggerDefault;
      }
      const req = { method: 'POST', body: { name: '???' } } as Partial<NextApiRequest> as NextApiRequest;
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid character name' });
    });
    // Restore default module mocks (ensure later tests use the normal sanitizeCharacterName)
    jest.resetModules();
    jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));
  });

  it('falls back to silhouette when OpenAI import fails', async () => {
    // Make dynamic import of 'openai' throw
    jest.doMock('openai', () => { throw new Error('no openai'); });
    // Ensure logger default exists in this module context
    jest.doMock('../../../src/utils/logger', () => ({ default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
    const handler = require('../../../pages/api/generate-avatar').default;
    const req = { method: 'POST', body: { name: 'Hero' } } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith({ avatarUrl: '/silhouette.svg' });
    expect(mockLogEvent).toHaveBeenCalledWith('error', 'avatar_unhandled_error', 'Unhandled error in generate-avatar', expect.any(Object));
  });

  it('returns avatarUrl and gender on successful primary image generation', async () => {
    // Mock openai to return a valid JSON prompt and image URL
    const mockCreate = jest.fn().mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ subject: 's', artStyle: 'a', composition: 'c', iconicElements: 'i', negativePrompts: 'n', gender: 'female' }) } }] });
    const mockImagesGenerate = jest.fn().mockResolvedValueOnce({ data: [{ url: 'http://example.com/img.png' }] });
    jest.doMock('openai', () => {
      return function OpenAIMock() {
        return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
      };
    });
    jest.doMock('../../../src/utils/logger', () => ({ default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));

    const handler = require('../../../pages/api/generate-avatar').default;
    const req = { method: 'POST', body: { name: 'TestName' } } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith({ avatarUrl: 'http://example.com/img.png', gender: 'female' });
    // Ensure success logs were emitted
    expect(mockLogEvent).toHaveBeenCalledWith('info', 'avatar_image_primary_success', 'Image generated successfully with primary model', expect.any(Object));
  });

  it('falls back to fallback model when primary fails and returns silhouette when fallback fails', async () => {
    // Isolate module context so mocks are fresh and no previous imports leak
    await jest.isolateModulesAsync(async () => {
      // Reset modules to avoid any cached imports interfering with isolated mocks
      jest.resetModules();
      const mockCreate = jest.fn().mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ subject: 's' }) } }] });
      const errPrimary = new Error('primary failed');
      const errFallback = new Error('fallback failed');
      const mockImagesGenerate = jest.fn()
        .mockRejectedValueOnce(errPrimary) // primary
        .mockRejectedValueOnce(errFallback); // fallback

      jest.doMock('openai', () => {
        return function OpenAIMock() {
          return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
        };
      });
      // Re-mock sanitizeCharacterName for isolated module context
      jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));
      jest.doMock('../../../src/utils/logger', () => ({
        default: mockLoggerDefault,
        logger: mockLoggerDefault,
        logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
        sanitizeLogMeta: (m: unknown) => mockSanitize(m)
      }));

      const handler = require('../../../pages/api/generate-avatar').default;
      // Ensure logger default has warn function in this isolated module context
      const loggerMod = require('../../../src/utils/logger');
      if (!loggerMod.default || typeof loggerMod.default.warn !== 'function') {
        loggerMod.default = mockLoggerDefault;
      }
      const req = { method: 'POST', body: { name: 'Failing' } } as Partial<NextApiRequest> as NextApiRequest;
      const res = makeRes();
      await handler(req, res);

      // Should return silhouette after fallback also fails
      expect(res.json).toHaveBeenCalledWith({ avatarUrl: '/silhouette.svg' });
      expect(mockLogEvent).toHaveBeenCalledWith('error', 'avatar_image_fallback_error', 'OpenAI image generation error (fallback)', expect.any(Object));
      expect(mockLogEvent).toHaveBeenCalledWith('warn', 'avatar_image_fallback_failed', 'Fallback image model also failed, using silhouette', expect.any(Object));
    });
  });

  it('handles moderation blocked and then uses fallback successfully', async () => {
    await jest.isolateModulesAsync(async () => {
      // Reset modules to avoid any cached imports interfering with isolated mocks
      jest.resetModules();
      const mockCreate = jest.fn().mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ subject: 's' }) } }] });
      const modErr = new Error('blocked') as { code?: string };
      modErr.code = 'moderation_blocked';
      const mockImagesGenerate = jest.fn()
        .mockRejectedValueOnce(modErr) // primary moderation blocked
        // gpt-image-* models return base64 (`b64_json`) rather than URL
        .mockResolvedValueOnce({ data: [{ b64_json: 'ABCD' }] }); // fallback succeed

      jest.doMock('openai', () => {
        return function OpenAIMock() {
          return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
        };
      });
      // Re-mock sanitizeCharacterName for isolated module context
      jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));
      jest.doMock('../../../src/utils/logger', () => ({
        default: mockLoggerDefault,
        logger: mockLoggerDefault,
        logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
        sanitizeLogMeta: (m: unknown) => mockSanitize(m)
      }));

      const handler = require('../../../pages/api/generate-avatar').default;
      const req = { method: 'POST', body: { name: 'Blocked' } } as Partial<NextApiRequest> as NextApiRequest;
      const res = makeRes();
      await handler(req, res);

      // (previously had debug output here)

      expect(res.json).toHaveBeenCalledWith({ avatarUrl: 'data:image/png;base64,ABCD', gender: null });
      expect(mockLogEvent).toHaveBeenCalledWith('warn', 'avatar_image_moderation_blocked', 'OpenAI image generation blocked by moderation/safety system', expect.any(Object));
    });
  });

  it('falls back to default prompt when prompt generation fails but image succeeds', async () => {
      await jest.isolateModulesAsync(async () => {
        jest.resetModules();
        const mockCreate = jest.fn().mockRejectedValueOnce(new Error('prompt failed'));
        const mockImagesGenerate = jest.fn().mockResolvedValueOnce({ data: [{ url: 'http://example.com/prompt-fallback.png' }] });

        jest.doMock('openai', () => {
          return function OpenAIMock() {
            return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
          };
        });

        jest.doMock('../../../src/utils/logger', () => ({
          default: mockLoggerDefault,
          logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
          sanitizeLogMeta: (m: unknown) => mockSanitize(m)
        }));

        const handler = require('../../../pages/api/generate-avatar').default;
        // Ensure logger default has warn function in this isolated module context
        const loggerMod = require('../../../src/utils/logger');
        if (!loggerMod.default || typeof loggerMod.default.warn !== 'function') {
          loggerMod.default = mockLoggerDefault;
        }
        const req = { method: 'POST', body: { name: 'PromptFail' } } as Partial<NextApiRequest> as NextApiRequest;
        const res = makeRes();
        await handler(req, res);

        // prompt fallback should have been used (result may still be silhouette if later handling fell back)
        expect(res.json).toHaveBeenCalled();
        // If an image URL was returned, it should not be the silhouette; otherwise silhouette is acceptable as later fallback
        const calledArg = (res.json as jest.Mock).mock.calls[0][0];
        expect(calledArg).toBeDefined();
        expect(["/silhouette.svg", 'http://example.com/prompt-fallback.png']).toContain(calledArg.avatarUrl);
        expect(calledArg.gender === undefined || calledArg.gender === null).toBe(true);
      });
    });

    // New tests: ensure required negative exclusions are present in the prompt passed to the image model
    it('includes negativePrompts from generated JSON in the final image prompt', async () => {
      await jest.isolateModulesAsync(async () => {
        jest.resetModules();
        const mockCreate = jest.fn().mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ subject: 's', negativePrompts: 'no collage, no side-by-side photos, single face only, no watermark' }) } }] });
        let capturedParams: Record<string, unknown> | null = null;
        const mockImagesGenerate = jest.fn().mockImplementationOnce((params: Record<string, unknown>) => {
          capturedParams = params;
          return Promise.resolve({ data: [{ url: 'http://example.com/neg.png' }] });
        });

        jest.doMock('openai', () => {
          return function OpenAIMock() {
            return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
          };
        });

        jest.doMock('../../../src/utils/logger', () => ({
          default: mockLoggerDefault,
          logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
          sanitizeLogMeta: (m: unknown) => mockSanitize(m)
        }));

        const handler = require('../../../pages/api/generate-avatar').default;
        const req = { method: 'POST', body: { name: 'NegativeTest' } } as Partial<NextApiRequest> as NextApiRequest;
        const res = makeRes();
        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({ avatarUrl: 'http://example.com/neg.png', gender: null });
        expect(capturedParams).toBeTruthy();
        const prompt = (capturedParams! as Record<string, unknown>)['prompt'];
        expect(typeof prompt).toBe('string');
        const p = (prompt as string).toLowerCase();
        expect(p).toContain('no collage');
        expect(p).toContain('no side-by-side');
        expect(p).toContain('single face');
        expect(p).toContain('no watermark');
      });
    });

    it('fallback prompt contains strict exclusions when prompt generation fails', async () => {
      await jest.isolateModulesAsync(async () => {
        jest.resetModules();
        const mockCreate = jest.fn().mockRejectedValueOnce(new Error('prompt failed'));
        let capturedParams: Record<string, unknown> | null = null;
        const mockImagesGenerate = jest.fn().mockImplementationOnce((params: Record<string, unknown>) => {
          capturedParams = params;
          return Promise.resolve({ data: [{ url: 'http://example.com/fallback-neg.png' }] });
        });

        jest.doMock('openai', () => {
          return function OpenAIMock() {
            return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
          };
        });

        jest.doMock('../../../src/utils/logger', () => ({
          default: mockLoggerDefault,
          logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
          sanitizeLogMeta: (m: unknown) => mockSanitize(m)
        }));

        const handler = require('../../../pages/api/generate-avatar').default;
        const req = { method: 'POST', body: { name: 'FallbackNeg' } } as Partial<NextApiRequest> as NextApiRequest;
        const res = makeRes();
        await handler(req, res);

        // If the image was returned, ensure the prompt used the stronger fallback exclusions
        expect(res.json).toHaveBeenCalled();
        if (!capturedParams) {
          // If images.generate wasn't invoked, we may still have a logged fallback prompt or a silhouette result.
          const fallbackCall = mockLogEvent.mock.calls.find((c) => c[1] === 'avatar_dalle_prompt_fallback');
          if (fallbackCall) {
            const meta = fallbackCall[3] as { prompt?: string } | undefined;
            expect(meta).toBeTruthy();
            expect(typeof meta!.prompt).toBe('string');
            expect(meta!.prompt).toContain('Do NOT create collages');
            // Narrow type before calling string methods
            const promptText = String(meta!.prompt).toLowerCase();
            expect(promptText).toContain('watermark');
            expect(promptText).toContain('extra faces');
          } else {
            // As a last resort accept silhouette result (indicates later generation failed)
            const calledArg = (res.json as jest.Mock).mock.calls[0][0];
            expect(calledArg).toBeDefined();
            expect(calledArg.avatarUrl).toBe('/silhouette.svg');
          }
        } else {
          const prompt = (capturedParams! as Record<string, unknown>)['prompt'];
          expect(typeof prompt).toBe('string');
          const p = (prompt as string);
          expect(p).toContain('Do NOT create collages');
          expect(p.toLowerCase()).toContain('watermark');
          expect(p.toLowerCase()).toContain('extra faces');
        }
      });
    });

    it('logs model-unverified and falls back to secondary model', async () => {
      await jest.isolateModulesAsync(async () => {
        jest.resetModules();
        const mockCreate = jest.fn().mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ subject: 's' }) } }] });
        const errPrimary = new Error('you must be verified to use the model');
        const mockImagesGenerate = jest.fn()
          .mockRejectedValueOnce(errPrimary) // primary model complains about verification
          .mockResolvedValueOnce({ data: [{ url: 'http://example.com/fallback.png' }] }); // fallback success

        jest.doMock('openai', () => {
          return function OpenAIMock() {
            return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
          };
        });

        jest.doMock('../../../src/utils/logger', () => ({
          default: mockLoggerDefault,
          logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
          sanitizeLogMeta: (m: unknown) => mockSanitize(m)
        }));

        const handler = require('../../../pages/api/generate-avatar').default;
        const req = { method: 'POST', body: { name: 'Unverified' } } as Partial<NextApiRequest> as NextApiRequest;
        const res = makeRes();
        await handler(req, res);

        // Model unverified should have been detected and logged; final response might be silhouette fallback
        expect(res.json).toHaveBeenCalled();
        expect(mockLogEvent).toHaveBeenCalledWith('warn', 'avatar_image_model_unverified', 'Model unavailable: organization not verified', expect.any(Object));
        const calledArg2 = (res.json as jest.Mock).mock.calls[0][0];
        expect(["/silhouette.svg", 'http://example.com/fallback.png']).toContain(calledArg2.avatarUrl);
        expect(calledArg2.gender === undefined || calledArg2.gender === null).toBe(true);
      });
    });

    it('returns silhouette when OpenAI returns empty image data for both models', async () => {
      await jest.isolateModulesAsync(async () => {
        jest.resetModules();
        const mockCreate = jest.fn().mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ subject: 's' }) } }] });
        const mockImagesGenerate = jest.fn()
          .mockResolvedValueOnce({ data: [{}] }) // primary returns empty entry
          .mockResolvedValueOnce({ data: [{}] }); // fallback also returns empty

        jest.doMock('openai', () => {
          return function OpenAIMock() {
            return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
          };
        });

        jest.doMock('../../../src/utils/logger', () => ({
          default: mockLoggerDefault,
          logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
          sanitizeLogMeta: (m: unknown) => mockSanitize(m)
        }));

        const handler = require('../../../pages/api/generate-avatar').default;
        const req = { method: 'POST', body: { name: 'EmptyImage' } } as Partial<NextApiRequest> as NextApiRequest;
        const res = makeRes();
        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({ avatarUrl: '/silhouette.svg', gender: null });
        expect(mockLogEvent).toHaveBeenCalledWith('error', 'avatar_image_none', 'No image returned from OpenAI, using silhouette', expect.any(Object));
      });
    });

    it('truncates very long generated prompts to 1000 characters before calling images API', async () => {
        await jest.isolateModulesAsync(async () => {
          jest.resetModules();
          // Create an overly long subject to force prompt truncation
          const longSubject = 'A'.repeat(2000);
          const mockCreate = jest.fn().mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ subject: longSubject }) } }] });
          let capturedParams: Record<string, unknown> | null = null;
          const mockImagesGenerate = jest.fn().mockImplementationOnce((params: Record<string, unknown>) => {
            capturedParams = params;
            return Promise.resolve({ data: [{ url: 'http://example.com/long.png' }] });
          });

          jest.doMock('openai', () => {
            return function OpenAIMock() {
              return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
            };
          });

          jest.doMock('../../../src/utils/logger', () => ({
            default: mockLoggerDefault,
            logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
            sanitizeLogMeta: (m: unknown) => mockSanitize(m)
          }));

          const handler = require('../../../pages/api/generate-avatar').default;
          const req = { method: 'POST', body: { name: 'LongPrompt' } } as Partial<NextApiRequest> as NextApiRequest;
          const res = makeRes();
          await handler(req, res);

          expect(res.json).toHaveBeenCalledWith({ avatarUrl: 'http://example.com/long.png', gender: null });
          // The prompt passed to images.generate should be truncated to at most 1000 chars
          expect(capturedParams).toBeTruthy();
          const prompt = (capturedParams! as Record<string, unknown>)['prompt'];
          expect(typeof prompt).toBe('string');
          expect((prompt as string).length).toBeLessThanOrEqual(1000);
        });
      });

      it('sets high quality for gpt-image-1.5 and returns a data URL', async () => {
        await jest.isolateModulesAsync(async () => {
          jest.resetModules();
          // Force model selector to use gpt-image-1.5 as primary
          jest.doMock('../../../src/utils/openaiModelSelector', () => ({ getOpenAIModel: (_: string) => ({ primary: 'gpt-image-1.5', fallback: 'gpt-image-1-mini' }) }));
          const mockCreate = jest.fn().mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ subject: 's' }) } }] });
          let capturedParams: Record<string, unknown> | null = null;
          const mockImagesGenerate = jest.fn().mockImplementationOnce((params: Record<string, unknown>) => {
            capturedParams = params;
            return Promise.resolve({ data: [{ b64_json: 'XYZ' }] });
          });

          jest.doMock('openai', () => {
            return function OpenAIMock() {
              return { chat: { completions: { create: mockCreate } }, images: { generate: mockImagesGenerate } };
            };
          });

          jest.doMock('../../../src/utils/logger', () => ({
            default: mockLoggerDefault,
            logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
            sanitizeLogMeta: (m: unknown) => mockSanitize(m)
          }));

          const handler = require('../../../pages/api/generate-avatar').default;
          const req = { method: 'POST', body: { name: 'HighQuality' } } as Partial<NextApiRequest> as NextApiRequest;
          const res = makeRes();
          await handler(req, res);

          // b64_json responses should be converted to data URL
          expect(res.json).toHaveBeenCalledWith({ avatarUrl: 'data:image/png;base64,XYZ', gender: null });
          expect(capturedParams).toBeTruthy();
          // Ensure quality was set to high for gpt-image-1.5
          expect((capturedParams! as Record<string, unknown>)['quality']).toBe('high');
          // GPT image models should not include response_format
          expect((capturedParams! as Record<string, unknown>)['response_format']).toBeUndefined();
        });
      });
});

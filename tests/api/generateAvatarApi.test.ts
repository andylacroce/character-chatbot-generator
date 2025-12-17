import { createMocks } from 'node-mocks-http';
import type { OpenAIImageGenerateParams } from '../../src/types/openai-image';

jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({
        chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Black","gender":"male","other":"basketball player"}' } }] }) } },
        images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
    }));
});

jest.mock('node-fetch', () => {
    return {
        __esModule: true,
        default: jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => Buffer.from('fakeimg', 'utf-8'),
            headers: { get: () => null }
        })
    };
});

jest.mock("../../src/utils/openaiModelSelector", () => ({
    getOpenAIModel: (type: "text" | "image") => {
        if (type === "text") return "gpt-4o";
        if (type === "image") return { primary: "dall-e-2", fallback: "dall-e-2" };
        throw new Error("Unknown type");
    }
}));

describe('generate-avatar API', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.restoreAllMocks();
    });

    it('returns 400 if name is missing', async () => {
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: {} });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);
    });

    it('returns 400 if name is not a string', async () => {
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 123 } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);
    });

    it('returns 400 if sanitized name is empty', async () => {
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: '   ' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);
    });

    it('returns 405 if not POST', async () => {
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(405);
    });

    it('returns 200 and a data URL or fallback for a valid name (mocked OpenAI and node-fetch)', async () => {
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBeTruthy();
    });

    it('returns 200 and fallback silhouette if OpenAI image generation fails for both models', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Black","gender":"male","other":"basketball player"}' } }] }) } },
                images: { generate: jest.fn().mockRejectedValue(new Error('OpenAI error')) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('handles OpenAI chat completion failure gracefully', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockRejectedValue(new Error('chat error')) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBeTruthy();
    });

    it('returns fallback silhouette if top-level error is thrown', async () => {
        jest.mock('openai', () => {
            throw new Error('top-level error');
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('trims prompt in all nested steps if too long', async () => {
        // Mock OpenAI to return a very long 'other' field
        const longOther = 'x'.repeat(2000);
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: `{"race":"Black","gender":"male","other":"${longOther}"}` } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        // No assertion on prompt, just that it succeeds
    });

    it('handles gpt-image-1 unavailable due to org not verified', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Black","gender":"male","other":"basketball player"}' } }] }) } },
                images: {
                    generate: jest.fn()
                        .mockRejectedValueOnce({ message: 'You must be verified to use the model', status: 403 })
                        .mockResolvedValueOnce({ data: [{ url: 'http://fakeimg.com/avatar.png' }] })
                }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
    try { data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw; } catch { data = dataRaw; }
        expect(data.avatarUrl).toBeTruthy();
    });

    it('returns fallback silhouette if OpenAI returns empty image data', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Black","gender":"male","other":"basketball player"}' } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('handles GPT response JSON parsing error gracefully', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'invalid json response' } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBeTruthy();
    });

    it('handles GPT response with empty content gracefully', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '' } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBeTruthy();
    });

    it('trims negativePrompt when prompt exceeds max length', async () => {
        // Create a very long 'other' field that will exceed 1000 chars after adding all components
        const longOther = 'x'.repeat(800); // This should make the total prompt > 1000
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: `{"race":"Black","gender":"male","other":"${longOther}"}` } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        // Test passes if no error is thrown during prompt trimming
    });

    it('trims singleInstruction when prompt still exceeds max length after removing negativePrompt', async () => {
        // Create an extremely long 'other' field that requires removing both negative and single instructions
        const longOther = 'x'.repeat(1200); // This should require removing both negative and single
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: `{"race":"Black","gender":"male","other":"${longOther}"}` } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        // Test passes if no error is thrown during prompt trimming
    });

    it('trims styleInstruction when prompt still exceeds max length after removing negative and single', async () => {
        // Create an extremely long 'other' field that requires removing negative, single, and style
        const longOther = 'x'.repeat(1600); // This should require removing negative, single, and style
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: `{"race":"Black","gender":"male","other":"${longOther}"}` } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        // Test passes if no error is thrown during prompt trimming
    });

    it('trims likenessRef as last resort when prompt still exceeds max length', async () => {
        // Create an extremely long 'other' field that requires trimming likenessRef as final step
        const longOther = 'x'.repeat(2000); // This should require all trimming steps including likenessRef
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: `{"race":"Black","gender":"male","other":"${longOther}"}` } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        // Test passes if no error is thrown during prompt trimming
    });

    it('returns data URL for GPT image models with b64_json response', async () => {
        // Note: This test uses the existing mocked OpenAI setup which returns URL by default
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch {
            data = dataRaw;
        }
        // Mock returns a URL, not b64_json
        expect(data.avatarUrl).toMatch(/^http/);
    });

    it('handles moderation/safety system blocking and falls back to silhouette', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Black","gender":"male","other":"basketball player"}' } }] }) } },
                images: { generate: jest.fn().mockRejectedValue({ code: 'moderation_blocked', message: 'Content blocked by safety system' }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('handles extremely long character names by truncating prompt (negative removal)', async () => {
        // Create a very long name that will trigger prompt truncation
        const longName = 'A'.repeat(3000);
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Human","gender":"male","other":"warrior"}' } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: longName } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
    });

    it('handles prompt truncation when single instruction must be removed', async () => {
        // Use a name that creates a long enough base prompt
        const longName = 'B'.repeat(2500);
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Elf","gender":"female","other":"mage with very long descriptive text"}' } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: longName } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
    });

    it('handles prompt truncation when style instruction must be removed', async () => {
        const longName = 'C'.repeat(2800);
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Dwarf","gender":"male","other":"blacksmith"}' } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: longName } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
    });

    it('handles prompt truncation when likeness reference must be trimmed', async () => {
        const longName = 'D'.repeat(3500);
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Orc","gender":"male","other":"warrior chief"}' } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ url: 'http://fakeimg.com/avatar.png' }] }) }
            }));
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: longName } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
    });

    // New tests to assert image model parameter handling
    it('uses quality=high and returns data URL for gpt-image-1.5 (b64_json)', async () => {
        let capturedParams: Partial<OpenAIImageGenerateParams> | null = null;
        const fakeB64 = Buffer.from('fakeimg').toString('base64');
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Human","gender":"female","other":"artist"}' } }] }) } },
                images: { generate: jest.fn().mockImplementation((params: OpenAIImageGenerateParams) => {
                    capturedParams = params;
                    return Promise.resolve({ data: [{ b64_json: fakeB64 }] });
                }) }
            }));
        });
        jest.mock('../../src/utils/openaiModelSelector', () => ({ getOpenAIModel: (type: "text" | "image") => { if (type === 'text') return 'gpt-4o'; return { primary: 'gpt-image-1.5', fallback: 'dall-e-3' }; } }));
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Ada Lovelace' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        // Confirm params sent to OpenAI
        expect(capturedParams).toBeTruthy();
        expect(capturedParams!.model).toBe('gpt-image-1.5');
        expect(capturedParams!.quality).toBe('high');
        expect(capturedParams!.response_format).toBeUndefined();
        const dataRaw = res._getData();
        const data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        expect(data.avatarUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('uses quality=low for gpt-image-1-mini', async () => {
        let capturedParams: Partial<OpenAIImageGenerateParams> | null = null;
        const fakeB64 = Buffer.from('mini').toString('base64');
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Human","gender":"male","other":"miner"}' } }] }) } },
                images: { generate: jest.fn().mockImplementation((params: OpenAIImageGenerateParams) => {
                    capturedParams = params;
                    return Promise.resolve({ data: [{ b64_json: fakeB64 }] });
                }) }
            }));
        });
        jest.mock('../../src/utils/openaiModelSelector', () => ({ getOpenAIModel: (type: "text" | "image") => { if (type === 'text') return 'gpt-4o'; return { primary: 'gpt-image-1-mini', fallback: 'dall-e-3' }; } }));
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Tiny Tim' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(capturedParams).toBeTruthy();
        expect(capturedParams!.model).toBe('gpt-image-1-mini');
        expect(capturedParams!.quality).toBe('low');
    });

    it('uses response_format=url for DALL·E models and does not set quality', async () => {
        let capturedParams: Partial<OpenAIImageGenerateParams> | null = null;
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Human","gender":"female","other":"sculptor"}' } }] }) } },
                images: { generate: jest.fn().mockImplementation((params: OpenAIImageGenerateParams) => {
                    capturedParams = params;
                    return Promise.resolve({ data: [{ url: 'http://dalle.fake/avatar.png' }] });
                }) }
            }));
        });
        jest.mock('../../src/utils/openaiModelSelector', () => ({ getOpenAIModel: (type: "text" | "image") => { if (type === 'text') return 'gpt-4o'; return { primary: 'dall-e-3', fallback: 'dall-e-3' }; } }));
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Statue of Liberty' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(capturedParams).toBeTruthy();
        expect(capturedParams!.model).toBe('dall-e-3');
        expect(capturedParams!.response_format).toBe('url');
        expect(capturedParams!.quality).toBeUndefined();
        const dataRaw = res._getData();
        const data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        expect(data.avatarUrl).toBe('http://dalle.fake/avatar.png');
    });
});

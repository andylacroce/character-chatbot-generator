import { createMocks } from 'node-mocks-http';

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

describe('generate-avatar API', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.restoreAllMocks();
    });

    it('returns 400 if name is missing', async () => {
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: {} });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);
    });

    it('returns 405 if not POST', async () => {
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(405);
    });

    it('returns 200 and a data URL or fallback for a valid name (mocked OpenAI and node-fetch)', async () => {
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch (e) {
            data = dataRaw;
        }
        expect(data.avatarDataUrl || data.avatarUrl).toBeTruthy();
    });

    it('returns 200 and fallback silhouette if OpenAI image generation fails for both models', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Black","gender":"male","other":"basketball player"}' } }] }) } },
                images: { generate: jest.fn().mockRejectedValue(new Error('OpenAI error')) }
            }));
        });
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch (e) {
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
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch (e) {
            data = dataRaw;
        }
        expect(data.avatarDataUrl || data.avatarUrl).toBeTruthy();
    });

    it('returns fallback silhouette if node-fetch fails', async () => {
        jest.mock('node-fetch', () => {
            return {
                __esModule: true,
                default: jest.fn().mockRejectedValue(new Error('fetch failed'))
            };
        });
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch (e) {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('returns data URL if OpenAI returns only b64_json', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Black","gender":"male","other":"basketball player"}' } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{ b64_json: Buffer.from('fakeimg').toString('base64') }] }) }
            }));
        });
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch (e) {
            data = dataRaw;
        }
        const dataUrl = data.avatarDataUrl || data.avatarUrl;
        expect(typeof dataUrl).toBe('string');
        expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('returns fallback silhouette if both OpenAI models and b64_json are missing', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Black","gender":"male","other":"basketball player"}' } }] }) } },
                images: { generate: jest.fn().mockResolvedValue({ data: [{}] }) }
            }));
        });
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch (e) {
            data = dataRaw;
        }
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('returns fallback silhouette if top-level error is thrown', async () => {
        jest.mock('openai', () => {
            throw new Error('top-level error');
        });
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try {
            data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
        } catch (e) {
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
        const handler = (await import('../pages/api/generate-avatar')).default;
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
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try { data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw; } catch (e) { data = dataRaw; }
        expect(data.avatarDataUrl || data.avatarUrl).toBeTruthy();
    });

    it('returns fallback silhouette if fetch returns non-OK response', async () => {
        jest.mock('node-fetch', () => {
            return {
                __esModule: true,
                default: jest.fn().mockResolvedValue({ ok: false, buffer: async () => Buffer.from(''), headers: { get: () => 'image/png' } })
            };
        });
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try { data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw; } catch (e) { data = dataRaw; }
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('returns data URL with fallback content-type if missing', async () => {
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
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Dennis Rodman' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try { data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw; } catch (e) { data = dataRaw; }
        expect(data.avatarDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('returns fallback silhouette if OpenAI image generation is blocked by moderation', async () => {
        jest.mock('openai', () => {
            return jest.fn().mockImplementation(() => ({
                chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"race":"Ogre","gender":"male","other":"green skin, large build, Scottish accent, wears a tunic, lives in a swamp"}' } }] }) } },
                images: {
                    generate: jest.fn().mockRejectedValue({
                        code: 'moderation_blocked',
                        type: 'image_generation_user_error',
                        message: 'Request was rejected as a result of the safety system. Request may contain content that is not allowed by the safety system.'
                    })
                }
            }));
        });
        const handler = (await import('../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Shrek' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const dataRaw = res._getData();
        let data;
        try { data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw; } catch (e) { data = dataRaw; }
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });
});

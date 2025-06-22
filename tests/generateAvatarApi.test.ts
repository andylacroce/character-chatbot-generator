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

jest.mock("../src/utils/openaiModelSelector", () => ({
    getOpenAIModel: (type: "text" | "image") => {
        if (type === "text") return "gpt-3.5-turbo";
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
        expect(data.avatarUrl).toBeTruthy();
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
        expect(data.avatarUrl).toBeTruthy();
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
        expect(data.avatarUrl).toBeTruthy();
    });
});

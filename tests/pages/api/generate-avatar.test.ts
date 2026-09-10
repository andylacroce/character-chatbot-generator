import type { NextApiRequest, NextApiResponse } from 'next';

// Module-level Anthropic mock prevents the SDK constructor from running in jsdom
// (tests that need specific behaviour override this via jest.doMock inside isolateModulesAsync)
jest.mock('@anthropic-ai/sdk', () => ({
    default: function AnthropicStub() { return { messages: { create: jest.fn() } }; },
    __esModule: true
}));

// Mock logger
const mockLogEvent = jest.fn();
const mockSanitize = jest.fn((m: unknown) => m);
const mockLoggerDefault = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), log: jest.fn() };
jest.mock('../../../src/utils/logger', () => ({
    default: mockLoggerDefault,
    logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
    sanitizeLogMeta: (m: unknown) => mockSanitize(m)
}));

// Mock model selector
jest.mock('../../../src/utils/claudeModelSelector', () => ({
    getClaudeModel: (_: string) => 'claude-haiku-4-5-20251001'
}));

// Make sanitizeCharacterName permissive for tests (return trimmed input)
jest.mock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

const fakeB64 = Buffer.from('fakeimagedata').toString('base64');
const cloudflareDataUrl = `data:image/png;base64,${fakeB64}`;
const pollinationsDataUrl = `data:image/png;base64,${Buffer.from('pollinationsdata').toString('base64')}`;

function makeRes() {
    const res: Partial<NextApiResponse> = {};
    res.status = jest.fn().mockReturnValue(res as NextApiResponse);
    res.end = jest.fn().mockReturnValue(res as NextApiResponse);
    res.json = jest.fn().mockReturnValue(res as NextApiResponse);
    return res as NextApiResponse;
}

function mockAnthropic(promptJson: Record<string, unknown> = { subject: 's', gender: 'female' }) {
    const mockCreate = jest.fn().mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(promptJson) }]
    });
    jest.doMock('@anthropic-ai/sdk', () => ({
        default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
        __esModule: true
    }));
    return mockCreate;
}

function mockLoggerAndDeps() {
    jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
    jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
    jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));
}

describe('generate-avatar API', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...OLD_ENV,
            ANTHROPIC_API_KEY: 'test-key'
        };
        delete process.env.CLOUDFLARE_ACCOUNT_ID;
        delete process.env.CLOUDFLARE_API_TOKEN;
    });

    afterAll(() => {
        process.env = OLD_ENV;
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
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();
            mockLoggerAndDeps();
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (_: string) => '' }));
            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: '???' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid character name' });
        });
    });

    describe('Cloudflare Workers AI (primary, free)', () => {
        it('returns avatarUrl and gender when Cloudflare is configured and succeeds', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
                process.env.CLOUDFLARE_API_TOKEN = 'test-token';

                mockAnthropic();
                const mockFetch = jest.fn().mockResolvedValue({
                    ok: true,
                    json: async () => ({ success: true, result: { image: fakeB64 } }),
                });
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'TestName' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);

                expect(mockFetch).toHaveBeenCalledWith(
                    expect.stringContaining('https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/'),
                    expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) })
                );
                expect(res.json).toHaveBeenCalledWith({ avatarUrl: cloudflareDataUrl, gender: 'female' });
            });
        });

        it('never calls Cloudflare when CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN are unset, and falls through to Pollinations', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                mockAnthropic();
                const mockFetch = jest.fn().mockResolvedValue({
                    ok: true,
                    arrayBuffer: async () => Buffer.from('pollinationsdata'),
                });
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'TestName' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);

                // Only one fetch call — to Pollinations, never to Cloudflare's API.
                expect(mockFetch).toHaveBeenCalledTimes(1);
                expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('image.pollinations.ai'));
                expect(res.json).toHaveBeenCalledWith({ avatarUrl: pollinationsDataUrl, gender: 'female' });
            });
        });
    });

    describe('Pollinations.ai (fallback, free)', () => {
        it('falls back to Pollinations when Cloudflare is configured but fails', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
                process.env.CLOUDFLARE_API_TOKEN = 'test-token';

                mockAnthropic();
                const mockFetch = jest.fn()
                    .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' })
                    .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Buffer.from('pollinationsdata') });
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'TestName' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);

                expect(mockFetch).toHaveBeenCalledTimes(2);
                expect(res.json).toHaveBeenCalledWith({ avatarUrl: pollinationsDataUrl, gender: 'female' });
            });
        });

        it('returns silhouette when both Cloudflare and Pollinations fail', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
                process.env.CLOUDFLARE_API_TOKEN = 'test-token';

                mockAnthropic({ subject: 's', gender: 'male' });
                const mockFetch = jest.fn()
                    .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' })
                    .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'bad gateway' });
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'NoImage' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);
                expect(res.json).toHaveBeenCalledWith({ avatarUrl: '/silhouette.svg', gender: 'male' });
            });
        });

        it('returns silhouette when both providers throw', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                mockAnthropic({ subject: 's', gender: null });
                const mockFetch = jest.fn().mockRejectedValue(new Error('network down'));
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'FailImage' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);
                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: '/silhouette.svg' }));
            });
        });
    });

    it('uses fallback prompt when Claude prompt generation fails but image succeeds', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const mockCreate = jest.fn().mockRejectedValueOnce(new Error('prompt failed'));
            jest.doMock('@anthropic-ai/sdk', () => ({
                default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
                __esModule: true
            }));
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: async () => Buffer.from('pollinationsdata'),
            });
            global.fetch = mockFetch as unknown as typeof fetch;
            mockLoggerAndDeps();

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'PromptFail' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);

            expect(res.json).toHaveBeenCalled();
            expect(mockLogEvent).toHaveBeenCalledWith('info', 'avatar_prompt_fallback', 'Using fallback image prompt', expect.any(Object));
            const result = (res.json as jest.Mock).mock.calls[0][0];
            expect(result.avatarUrl).toMatch(/^data:image\/png;base64,/);
        });
    });

    it('outer catch returns silhouette on unhandled error', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            // logEvent throws on first call to trigger the outer catch
            const throwingLogEvent = jest.fn().mockImplementationOnce(() => {
                throw new Error('unexpected log failure');
            });
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => throwingLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            jest.doMock('@anthropic-ai/sdk', () => ({
                default: function AnthropicMock() { return { messages: { create: jest.fn() } }; },
                __esModule: true
            }));
            jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'Throws' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: '/silhouette.svg' }));
        });
    });

    it('uploads to Vercel Blob and returns the Blob URL when a Blob token is configured', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const mockPut = jest.fn().mockResolvedValue({ url: 'https://example-blob.public.blob.vercel-storage.com/avatars/fake-id.png' });
            jest.doMock('@vercel/blob', () => ({ put: (...args: unknown[]) => mockPut(...args) }));

            mockAnthropic();
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: async () => Buffer.from('pollinationsdata'),
            });
            global.fetch = mockFetch as unknown as typeof fetch;
            mockLoggerAndDeps();

            process.env.BLOB_READ_WRITE_TOKEN = 'fake-blob-token';

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'BlobBacked' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);

            expect(mockPut).toHaveBeenCalledWith(
                expect.stringMatching(/^avatars\/.+\.png$/),
                expect.any(Buffer),
                expect.objectContaining({ access: 'public', addRandomSuffix: false, contentType: 'image/png', token: 'fake-blob-token' })
            );
            expect(res.json).toHaveBeenCalledWith({
                avatarUrl: 'https://example-blob.public.blob.vercel-storage.com/avatars/fake-id.png',
                gender: 'female'
            });

            delete process.env.BLOB_READ_WRITE_TOKEN;
        });
    });

    it('falls back to the data URL when Blob upload fails', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const mockPut = jest.fn().mockRejectedValue(new Error('blob upload failed'));
            jest.doMock('@vercel/blob', () => ({ put: (...args: unknown[]) => mockPut(...args) }));

            mockAnthropic({ subject: 's', gender: null });
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: async () => Buffer.from('pollinationsdata'),
            });
            global.fetch = mockFetch as unknown as typeof fetch;
            mockLoggerAndDeps();

            process.env.BLOB_READ_WRITE_TOKEN = 'fake-blob-token';

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'BlobFails' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);

            expect(res.json).toHaveBeenCalledWith({ avatarUrl: pollinationsDataUrl, gender: null });
            expect(mockLogEvent).toHaveBeenCalledWith('error', 'avatar_blob_upload_failed', expect.any(String), expect.any(Object));

            delete process.env.BLOB_READ_WRITE_TOKEN;
        });
    });

    it('truncates very long generated prompts to 1000 characters', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const longSubject = 'A'.repeat(2000);
            mockAnthropic({ subject: longSubject, gender: null });
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: async () => Buffer.from('pollinationsdata'),
            });
            global.fetch = mockFetch as unknown as typeof fetch;
            mockLoggerAndDeps();

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'LongPrompt' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);

            const promptLog = mockLogEvent.mock.calls.find(c => c[1] === 'avatar_prompt_generated');
            if (promptLog) {
                const meta = promptLog[3] as { prompt?: string };
                if (meta?.prompt) {
                    expect(meta.prompt.length).toBeLessThanOrEqual(1000);
                }
            }
            expect(res.json).toHaveBeenCalled();
        });
    });

    describe('avatar cache (global, shared across users and environments)', () => {
        function mockDbWith(lookupResult: unknown[]) {
            const mockWhere = jest.fn().mockResolvedValue(lookupResult);
            const mockFrom = jest.fn(() => ({ where: mockWhere }));
            const mockSelect = jest.fn(() => ({ from: mockFrom }));
            const mockOnConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
            const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
            const mockInsert = jest.fn(() => ({ values: mockValues }));
            const mockDb = { select: mockSelect, insert: mockInsert };
            jest.doMock('../../../src/db/client', () => ({ getDb: () => mockDb }));
            return { mockWhere, mockSelect, mockInsert, mockValues, mockOnConflictDoUpdate };
        }

        it('returns a cache hit immediately, without calling Claude or any image provider', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                process.env.DATABASE_URL = 'postgres://user:pass@host/db';

                const { mockSelect } = mockDbWith([{ avatarUrl: 'https://blob.example.com/cached.png', gender: 'male' }]);

                const mockCreate = jest.fn();
                jest.doMock('@anthropic-ai/sdk', () => ({
                    default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
                    __esModule: true
                }));
                const mockFetch = jest.fn();
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'Cached Character' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);

                expect(res.json).toHaveBeenCalledWith({ avatarUrl: 'https://blob.example.com/cached.png', gender: 'male' });
                expect(mockSelect).toHaveBeenCalled();
                expect(mockCreate).not.toHaveBeenCalled();
                expect(mockFetch).not.toHaveBeenCalled();
            });
        });

        it('caches a successful generation for reuse', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                process.env.DATABASE_URL = 'postgres://user:pass@host/db';

                const { mockInsert, mockValues } = mockDbWith([]);

                mockAnthropic();
                const mockFetch = jest.fn().mockResolvedValue({
                    ok: true,
                    arrayBuffer: async () => Buffer.from('pollinationsdata'),
                });
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'New Character' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);

                expect(mockInsert).toHaveBeenCalled();
                expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
                    characterName: 'new character',
                    gender: 'female',
                }));
            });
        });

        it('does not cache the /silhouette.svg fallback', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                process.env.DATABASE_URL = 'postgres://user:pass@host/db';

                const { mockInsert } = mockDbWith([]);

                mockAnthropic({ subject: 's', gender: null });
                const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'error' });
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'NoImage' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);

                expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: '/silhouette.svg' }));
                expect(mockInsert).not.toHaveBeenCalled();
            });
        });

        it('proceeds to generate normally when the cache lookup fails', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                process.env.DATABASE_URL = 'postgres://user:pass@host/db';

                const mockWhere = jest.fn().mockRejectedValue(new Error('db down'));
                const mockFrom = jest.fn(() => ({ where: mockWhere }));
                const mockSelect = jest.fn(() => ({ from: mockFrom }));
                const mockOnConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
                const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
                const mockInsert = jest.fn(() => ({ values: mockValues }));
                jest.doMock('../../../src/db/client', () => ({ getDb: () => ({ select: mockSelect, insert: mockInsert }) }));

                mockAnthropic({ subject: 's', gender: null });
                const mockFetch = jest.fn().mockResolvedValue({
                    ok: true,
                    arrayBuffer: async () => Buffer.from('pollinationsdata'),
                });
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'FallbackAfterLookupFail' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);

                const result = (res.json as jest.Mock).mock.calls[0][0];
                expect(result.avatarUrl).toMatch(/^data:image\/png;base64,/);
            });
        });

        it('still returns the generated avatar when the cache write fails', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                process.env.DATABASE_URL = 'postgres://user:pass@host/db';

                const mockWhere = jest.fn().mockResolvedValue([]);
                const mockFrom = jest.fn(() => ({ where: mockWhere }));
                const mockSelect = jest.fn(() => ({ from: mockFrom }));
                const mockOnConflictDoUpdate = jest.fn().mockRejectedValue(new Error('db down'));
                const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
                const mockInsert = jest.fn(() => ({ values: mockValues }));
                jest.doMock('../../../src/db/client', () => ({ getDb: () => ({ select: mockSelect, insert: mockInsert }) }));

                mockAnthropic({ subject: 's', gender: null });
                const mockFetch = jest.fn().mockResolvedValue({
                    ok: true,
                    arrayBuffer: async () => Buffer.from('pollinationsdata'),
                });
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'WriteFails' } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);

                const result = (res.json as jest.Mock).mock.calls[0][0];
                expect(result.avatarUrl).toMatch(/^data:image\/png;base64,/);
            });
        });
    });

    describe('skipPersistence (copyright warning overridden by the user)', () => {
        it('never checks or writes the shared avatar cache, and never uploads to Blob, even when both are configured', async () => {
            await jest.isolateModulesAsync(async () => {
                jest.resetModules();
                process.env.DATABASE_URL = 'postgres://user:pass@host/db';
                process.env.BLOB_READ_WRITE_TOKEN = 'fake-blob-token';

                const mockWhere = jest.fn().mockResolvedValue([{ avatarUrl: 'https://blob.example.com/cached.png', gender: 'male' }]);
                const mockFrom = jest.fn(() => ({ where: mockWhere }));
                const mockSelect = jest.fn(() => ({ from: mockFrom }));
                const mockOnConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
                const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
                const mockInsert = jest.fn(() => ({ values: mockValues }));
                jest.doMock('../../../src/db/client', () => ({ getDb: () => ({ select: mockSelect, insert: mockInsert }) }));

                const mockPut = jest.fn().mockResolvedValue({ url: 'https://example-blob.public.blob.vercel-storage.com/avatars/should-not-happen.png' });
                jest.doMock('@vercel/blob', () => ({ put: (...args: unknown[]) => mockPut(...args) }));

                mockAnthropic();
                const mockFetch = jest.fn().mockResolvedValue({
                    ok: true,
                    arrayBuffer: async () => Buffer.from('pollinationsdata'),
                });
                global.fetch = mockFetch as unknown as typeof fetch;
                mockLoggerAndDeps();

                const handler = require('../../../pages/api/generate-avatar').default;
                const req = { method: 'POST', body: { name: 'Mickey Mouse', skipPersistence: true } } as Partial<NextApiRequest> as NextApiRequest;
                const res = makeRes();
                await handler(req, res);

                // Never touches the cache table at all — not the pre-existing cached row above.
                expect(mockSelect).not.toHaveBeenCalled();
                expect(mockInsert).not.toHaveBeenCalled();
                // Never uploads to Blob — returns the raw data URL instead of a durable link.
                expect(mockPut).not.toHaveBeenCalled();
                expect(res.json).toHaveBeenCalledWith({ avatarUrl: pollinationsDataUrl, gender: 'female' });

                delete process.env.BLOB_READ_WRITE_TOKEN;
            });
        });
    });
});

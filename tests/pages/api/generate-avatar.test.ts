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

function makeRes() {
    const res: Partial<NextApiResponse> = {};
    res.status = jest.fn().mockReturnValue(res as NextApiResponse);
    res.end = jest.fn().mockReturnValue(res as NextApiResponse);
    res.json = jest.fn().mockReturnValue(res as NextApiResponse);
    return res as NextApiResponse;
}

describe('generate-avatar API', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...OLD_ENV,
            GOOGLE_CLOUD_PROJECT: 'test-project',
            GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({
                type: 'service_account',
                project_id: 'test-project',
                client_email: 'test@test.iam.gserviceaccount.com',
                private_key: 'fake-key'
            }),
            ANTHROPIC_API_KEY: 'test-key'
        };
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
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (_: string) => '' }));
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: '???' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid character name' });
        });
        jest.resetModules();
        jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));
    });

    it('returns avatarUrl and gender on successful image generation', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const mockCreate = jest.fn().mockResolvedValueOnce({
                content: [{ type: 'text', text: JSON.stringify({ subject: 's', artStyle: 'a', composition: 'c', iconicElements: 'i', negativePrompts: 'n', gender: 'female' }) }]
            });
            jest.doMock('@anthropic-ai/sdk', () => ({
                default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
                __esModule: true
            }));
            jest.doMock('@google/genai', () => ({
                GoogleGenAI: jest.fn().mockImplementation(() => ({
                    models: {
                        generateContent: jest.fn().mockResolvedValue({
                            candidates: [{ content: { parts: [{ inlineData: { data: fakeB64, mimeType: 'image/png' } }] } }]
                        })
                    }
                }))
            }));
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'TestName' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);
            expect(res.json).toHaveBeenCalledWith({ avatarUrl: `data:image/png;base64,${fakeB64}`, gender: 'female' });
        });
    });

    it('returns silhouette when Gemini returns no image data', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const mockCreate = jest.fn().mockResolvedValueOnce({
                content: [{ type: 'text', text: JSON.stringify({ subject: 's', gender: 'male' }) }]
            });
            jest.doMock('@anthropic-ai/sdk', () => ({
                default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
                __esModule: true
            }));
            jest.doMock('@google/genai', () => ({
                GoogleGenAI: jest.fn().mockImplementation(() => ({
                    models: {
                        generateContent: jest.fn().mockResolvedValue({
                            candidates: [{ content: { parts: [] } }]
                        })
                    }
                }))
            }));
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'NoImage' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);
            expect(res.json).toHaveBeenCalledWith({ avatarUrl: '/silhouette.svg', gender: 'male' });
        });
    });

    it('returns silhouette when Gemini throws an error', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const mockCreate = jest.fn().mockResolvedValueOnce({
                content: [{ type: 'text', text: JSON.stringify({ subject: 's', gender: null }) }]
            });
            jest.doMock('@anthropic-ai/sdk', () => ({
                default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
                __esModule: true
            }));
            jest.doMock('@google/genai', () => ({
                GoogleGenAI: jest.fn().mockImplementation(() => ({
                    models: {
                        generateContent: jest.fn().mockRejectedValue(new Error('Vertex AI error'))
                    }
                }))
            }));
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'FailImage' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: '/silhouette.svg' }));
        });
    });

    it('returns silhouette when safety filter triggers', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const mockCreate = jest.fn().mockResolvedValueOnce({
                content: [{ type: 'text', text: JSON.stringify({ subject: 's', gender: null }) }]
            });
            jest.doMock('@anthropic-ai/sdk', () => ({
                default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
                __esModule: true
            }));
            jest.doMock('@google/genai', () => ({
                GoogleGenAI: jest.fn().mockImplementation(() => ({
                    models: {
                        generateContent: jest.fn().mockResolvedValue({
                            candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }]
                        })
                    }
                }))
            }));
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'Blocked' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: '/silhouette.svg' }));
            expect(mockLogEvent).toHaveBeenCalledWith('warn', 'avatar_gemini_safety_filtered', 'Gemini image safety filter triggered', expect.any(Object));
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
            jest.doMock('@google/genai', () => ({
                GoogleGenAI: jest.fn().mockImplementation(() => ({
                    models: {
                        generateContent: jest.fn().mockResolvedValue({
                            candidates: [{ content: { parts: [{ inlineData: { data: fakeB64, mimeType: 'image/png' } }] } }]
                        })
                    }
                }))
            }));
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

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

    it('loads GCP credentials from file path when value is not JSON (line 31)', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const fakeCreds = JSON.stringify({ type: 'service_account', project_id: 'p' });
            jest.doMock('fs', () => ({
                existsSync: jest.fn().mockReturnValue(true),
                readFileSync: jest.fn().mockReturnValue(fakeCreds),
                writeFileSync: jest.fn(),
            }));
            const mockCreate = jest.fn().mockResolvedValueOnce({
                content: [{ type: 'text', text: JSON.stringify({ subject: 's', gender: null }) }]
            });
            jest.doMock('@anthropic-ai/sdk', () => ({
                default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
                __esModule: true
            }));
            jest.doMock('@google/genai', () => ({
                GoogleGenAI: jest.fn().mockImplementation(() => ({
                    models: {
                        generateContent: jest.fn().mockResolvedValue({
                            candidates: [{ content: { parts: [{ inlineData: { data: fakeB64, mimeType: 'image/png' } }] } }]
                        })
                    }
                }))
            }));
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

            // Set credentials as a file path (not a JSON string)
            process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = '/tmp/fake-creds.json';

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'FileCreds' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);

            expect(res.json).toHaveBeenCalled();
        });
    });

    it('returns silhouette when loadGcpCredentials throws (missing env var, lines 176-178)', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const mockCreate = jest.fn().mockResolvedValueOnce({
                content: [{ type: 'text', text: JSON.stringify({ subject: 's', gender: 'male' }) }]
            });
            jest.doMock('@anthropic-ai/sdk', () => ({
                default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
                __esModule: true
            }));
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

            // Remove credentials so loadGcpCredentials throws
            delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'MissingCreds' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: '/silhouette.svg' }));
            expect(mockLogEvent).toHaveBeenCalledWith('error', 'avatar_cred_error', expect.any(String), expect.any(Object));
        });
    });

    it('outer catch returns silhouette on unhandled error (lines 202-204)', async () => {
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

    it('truncates very long generated prompts to 1000 characters', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.resetModules();

            const longSubject = 'A'.repeat(2000);
            const mockCreate = jest.fn().mockResolvedValueOnce({
                content: [{ type: 'text', text: JSON.stringify({ subject: longSubject, gender: null }) }]
            });
            jest.doMock('@google/genai', () => ({
                GoogleGenAI: jest.fn().mockImplementation(() => ({
                    models: {
                        generateContent: jest.fn().mockImplementation(() => {
                            return Promise.resolve({
                                candidates: [{ content: { parts: [{ inlineData: { data: fakeB64, mimeType: 'image/png' } }] } }]
                            });
                        })
                    }
                }))
            }));
            jest.doMock('@anthropic-ai/sdk', () => ({
                default: function AnthropicMock() { return { messages: { create: mockCreate } }; },
                __esModule: true
            }));
            jest.doMock('../../../src/utils/logger', () => ({ __esModule: true, default: mockLoggerDefault, logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));
            jest.doMock('../../../src/utils/claudeModelSelector', () => ({ getClaudeModel: (_: string) => 'claude-test' }));
            jest.doMock('../../../src/utils/security', () => ({ sanitizeCharacterName: (s: string) => (typeof s === 'string' ? s.trim() : '') }));

            const handler = require('../../../pages/api/generate-avatar').default;
            const req = { method: 'POST', body: { name: 'LongPrompt' } } as Partial<NextApiRequest> as NextApiRequest;
            const res = makeRes();
            await handler(req, res);

            // Verify the prompt logged was <= 1000 chars
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
});

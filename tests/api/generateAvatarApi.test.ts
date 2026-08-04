import { createMocks } from 'node-mocks-http';

const fakeB64 = Buffer.from('fakeimagedata').toString('base64');

const mockAnthropicCreate = jest.fn().mockResolvedValue({
    content: [{ type: "text", text: '{"subject":"tall detective","artStyle":"photorealistic","composition":"headshot","iconicElements":"deerstalker hat","negativePrompts":"no duplicates","gender":"male"}' }]
});

jest.mock('@anthropic-ai/sdk', () => ({
    default: jest.fn().mockImplementation(() => ({
        messages: { create: mockAnthropicCreate }
    })),
    __esModule: true
}));

const mockGenerateContent = jest.fn().mockResolvedValue({
    candidates: [{
        content: {
            parts: [{ inlineData: { data: fakeB64, mimeType: 'image/png' } }]
        }
    }]
});

jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
        models: { generateContent: mockGenerateContent }
    }))
}));

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    readFileSync: jest.fn().mockReturnValue(JSON.stringify({
        type: 'service_account',
        project_id: 'test-project',
        client_email: 'test@test.iam.gserviceaccount.com',
        private_key: 'fake-key'
    }))
}));

jest.mock("../../src/utils/claudeModelSelector", () => ({
    getClaudeModel: (type: "text" | "text-simple" | "image") => {
        if (type === "image") return { primary: "gemini-3.1-flash-lite-image" };
        return "claude-haiku-4-5-20251001";
    }
}));

jest.mock('express-rate-limit', () => {
    return jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
});

describe('generate-avatar API', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
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
        mockAnthropicCreate.mockResolvedValue({
            content: [{ type: "text", text: '{"subject":"tall detective","artStyle":"photorealistic","composition":"headshot","iconicElements":"deerstalker hat","negativePrompts":"no duplicates","gender":"male"}' }]
        });
        mockGenerateContent.mockResolvedValue({
            candidates: [{
                content: {
                    parts: [{ inlineData: { data: fakeB64, mimeType: 'image/png' } }]
                }
            }]
        });
    });

    afterAll(() => {
        process.env = OLD_ENV;
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

    it('returns 200 and a data URL for a valid name', async () => {
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Sherlock Holmes' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.avatarUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('includes gender in response when Claude provides it', async () => {
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Sherlock Holmes' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.gender).toBe('male');
    });

    it('returns silhouette fallback when Gemini returns no image data', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            candidates: [{ content: { parts: [] } }]
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Sherlock Holmes' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('returns silhouette fallback when Gemini fails with an error', async () => {
        mockGenerateContent.mockRejectedValueOnce(new Error('Vertex AI error'));
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Sherlock Holmes' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('returns silhouette fallback when safety filter is triggered', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }]
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Sherlock Holmes' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('handles Claude prompt generation failure gracefully and uses fallback prompt', async () => {
        mockAnthropicCreate.mockRejectedValueOnce(new Error('Claude error'));
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Sherlock Holmes' } });
        await handler(req, res);
        // Should still attempt Gemini image generation with fallback prompt
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.avatarUrl).toBeTruthy();
    });

    it('returns silhouette fallback when GOOGLE_CLOUD_PROJECT is missing', async () => {
        delete process.env.GOOGLE_CLOUD_PROJECT;
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Sherlock Holmes' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.avatarUrl).toBe('/silhouette.svg');
    });

    it('returns silhouette fallback when ANTHROPIC_API_KEY triggers a top-level error', async () => {
        mockAnthropicCreate.mockImplementationOnce(() => { throw new Error('top-level error'); });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Sherlock Holmes' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.avatarUrl).toBeTruthy();
    });

    it('trims prompt when it exceeds 1000 characters', async () => {
        const longSubject = 'x'.repeat(900);
        mockAnthropicCreate.mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify({ subject: longSubject, artStyle: 'photorealistic', composition: 'headshot', iconicElements: '', negativePrompts: 'none', gender: 'male' }) }]
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Test Character' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        // Verify Gemini was still called (prompt was trimmed, not aborted)
        expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('returns silhouette when GCP credentials loading fails with a non-Error value', async () => {
        // Simulate loadGcpCredentials throwing a non-Error (exercises the String(credErr) branch)
        const fsModule = require('fs');
        fsModule.readFileSync.mockImplementationOnce(() => { throw 'raw string cred error'; });
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = '';
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Test Character' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData().avatarUrl).toBe('/silhouette.svg');
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
            type: 'service_account', project_id: 'test-project',
            client_email: 'test@test.iam.gserviceaccount.com', private_key: 'fake-key'
        });
    });

    it('covers non-Error Gemini failure branch (uses String(err))', async () => {
        // Throw a plain string (non-Error) from Gemini to exercise String(err) branch
        mockGenerateContent.mockRejectedValueOnce('plain string error');
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Test Character' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData().avatarUrl).toBe('/silhouette.svg');
    });

    it('covers non-Error top-level catch branch', async () => {
        // Make the anthropic constructor throw a non-Error to enter catch with non-Error
        mockAnthropicCreate.mockImplementationOnce(() => { throw 42; });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Test Character' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData().avatarUrl).toBeTruthy();
    });

    it('covers non-text content[0] type in prompt generation (uses empty fallback)', async () => {
        // Returning non-text content forces the fallback branch: content[0]?.type !== "text" → "{}"
        mockAnthropicCreate.mockResolvedValueOnce({
            content: [{ type: 'image', source: {} }]
        });
        const handler = (await import('../../pages/api/generate-avatar')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 'Test Character' } });
        await handler(req, res);
        // JSON.parse("{}") → promptData with no subject etc, still generates ok
        expect(res._getStatusCode()).toBe(200);
    });
});

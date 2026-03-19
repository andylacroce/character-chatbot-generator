import { createMocks } from 'node-mocks-http';

const mockCreate = jest.fn().mockResolvedValue({
    content: [{
        type: "text",
        text: JSON.stringify({
            isPublicDomain: true,
            isSafe: true,
            warningLevel: "none",
            reason: "Sherlock Holmes is a public domain character from classic literature.",
            suggestions: []
        })
    }]
});

jest.mock('@anthropic-ai/sdk', () => ({
    default: jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate }
    })),
    __esModule: true
}));

jest.mock("../../src/utils/claudeModelSelector", () => ({
    getClaudeModel: (type: "text" | "text-simple" | "image") => {
        if (type === "image") throw new Error("Unknown type");
        return "claude-haiku-4-5-20251001";
    }
}));

jest.mock('express-rate-limit', () => {
    return jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
});

describe('validate-character API', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.restoreAllMocks();
        jest.clearAllMocks();
        mockCreate.mockResolvedValue({
            content: [{
                type: "text",
                text: JSON.stringify({
                    isPublicDomain: true,
                    isSafe: true,
                    warningLevel: "none",
                    reason: "Sherlock Holmes is a public domain character from classic literature.",
                    suggestions: []
                })
            }]
        });
    });

    it('returns 405 if method is not POST', async () => {
        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(405);
    });

    it('returns 400 if name is missing', async () => {
        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({ method: 'POST', body: {} });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);
    });

    it('returns 400 if name is not a string', async () => {
        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: 123 } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);
    });

    it('returns 400 if name is empty', async () => {
        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({ method: 'POST', body: { name: '   ' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);
    });

    it('returns validation result for public domain character', async () => {
        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Sherlock Holmes' }
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.characterName).toBe('Sherlock Holmes');
        expect(data.isPublicDomain).toBe(true);
        expect(data.isSafe).toBe(true);
        expect(data.warningLevel).toBe('none');
    });

    it('returns warning for copyrighted character', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({
                    isPublicDomain: false,
                    isSafe: false,
                    warningLevel: "warning",
                    reason: "Spider-Man is a trademarked character owned by Marvel/Disney.",
                    suggestions: ["Hercules", "Beowulf", "Robin Hood"]
                })
            }]
        });

        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Spider-Man' }
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.characterName).toBe('Spider-Man');
        expect(data.isPublicDomain).toBe(false);
        expect(data.isSafe).toBe(false);
        expect(data.warningLevel).toBe('warning');
        expect(data.suggestions).toContain('Hercules');
    });

    it('returns caution for uncertain character', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({
                    isPublicDomain: true,
                    isSafe: true,
                    warningLevel: "caution",
                    reason: "Status uncertain, proceed with caution.",
                    suggestions: ["Zeus", "Athena", "Apollo"]
                })
            }]
        });

        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'SomeUnknownCharacter' }
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.warningLevel).toBe('caution');
    });

    it('handles Claude API errors gracefully', async () => {
        mockCreate.mockRejectedValueOnce(new Error('Claude API error'));

        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Test Character' }
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.isSafe).toBe(true);
        expect(data.warningLevel).toBe('none');
        expect(data.reason).toContain('Unable to validate');
    });

    it('handles invalid JSON from Claude gracefully', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ type: "text", text: 'invalid json string' }]
        });

        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Test' }
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.isSafe).toBe(true);
    });

    it('returns validation result for safe character with empty suggestions', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({
                    isPublicDomain: true,
                    isSafe: true,
                    warningLevel: "none",
                    reason: "Safe character."
                })
            }]
        });

        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Homer' }
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.characterName).toBe('Homer');
        expect(data.suggestions).toEqual([]);
    });

    it('handles partial validation response', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({ isPublicDomain: false })
            }]
        });

        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Partial' }
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.isPublicDomain).toBe(false);
        expect(data.isSafe).toBe(true); // defaults to true
        expect(data.warningLevel).toBe('none'); // defaults to none
    });

    it('extracts IP from x-forwarded-for header', async () => {
        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Test' },
            headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
    });

    it('extracts IP from x-real-ip header when x-forwarded-for is missing', async () => {
        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Test' },
            headers: { 'x-real-ip': '1.2.3.4' }
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
    });

    it('handles request with connection.remoteAddress fallback', async () => {
        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Test' }
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).connection = { remoteAddress: '1.2.3.4' };
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
    });

    it('handles request with socket.remoteAddress fallback', async () => {
        const handler = (await import('../../pages/api/validate-character')).default;
        const { req, res } = createMocks({
            method: 'POST',
            body: { name: 'Test' }
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).socket = { remoteAddress: '1.2.3.4' };
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
    });
});

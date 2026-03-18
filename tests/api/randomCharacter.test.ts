import { createMocks } from 'node-mocks-http';

const mockCreate = jest.fn().mockResolvedValue({
    content: [{
        type: "text",
        text: JSON.stringify({ suggestions: ['Sherlock Holmes', 'Robin Hood', 'Hercules'] })
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

describe('random-character API', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockCreate.mockResolvedValue({
            content: [{
                type: "text",
                text: JSON.stringify({ suggestions: ['Sherlock Holmes', 'Robin Hood', 'Hercules'] })
            }]
        });
    });

    it('returns 405 if method is not GET', async () => {
        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'POST' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(405);
    });

    it('returns suggestions and a chosen name when Claude responds with suggestions', async () => {
        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(Array.isArray(data.suggestions)).toBe(true);
        expect(data.suggestions.length).toBeGreaterThan(0);
        expect(typeof data.name).toBe('string');
        expect(data.suggestions).toContain(data.name);
    });

    it('normalizes, de-duplicates, and limits suggestions from Claude', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({
                    suggestions: [
                        '  Sherlock Holmes ',
                        'Sherlock Holmes',
                        'Robin Hood',
                        'Dracula',
                        'Dracula',
                        'Hercules',
                        'Zeus'
                    ]
                })
            }]
        });

        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        const data = res._getJSONData();
        expect(data.suggestions).toEqual([
            'Sherlock Holmes',
            'Robin Hood',
            'Dracula',
            'Hercules',
            'Zeus'
        ]);
    });

    it('tracks all shown suggestions and excludes them from subsequent calls', async () => {
        // First call returns Alpha, Bravo, Charlie, Delta — all get tracked
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({ suggestions: ['Alpha', 'Bravo', 'Charlie', 'Delta'] })
            }]
        });
        // Second call: Claude returns fresh suggestions not in recentNames
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({ suggestions: ['Echo', 'Foxtrot', 'Golf', 'Hotel'] })
            }]
        });

        const handler = (await import('../../pages/api/random-character')).default;
        const first = createMocks({ method: 'GET' });
        await handler(first.req, first.res);
        const firstData = first.res._getJSONData();

        const second = createMocks({ method: 'GET' });
        await handler(second.req, second.res);
        const secondData = second.res._getJSONData();

        expect(firstData.name).toBe('Alpha');
        // Second call returns entirely fresh names — none from the first batch
        expect(secondData.suggestions).toEqual(['Echo', 'Foxtrot', 'Golf', 'Hotel']);
        expect(secondData.name).toBe('Echo');
    });

    it('returns 500 when Claude errors', async () => {
        mockCreate.mockRejectedValueOnce(new Error('Claude API error'));

        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData()).toEqual({ error: 'Failed to generate random character' });
    });

    it('returns 500 when Claude returns no suggestions', async () => {
        // Both the initial call and the retry return empty
        mockCreate.mockResolvedValue({
            content: [{ type: "text", text: JSON.stringify({ suggestions: [] }) }]
        });

        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData()).toEqual({ error: 'Failed to generate character suggestions' });
    });

    it('includes recent names in exclusion list for creative diversity', async () => {
        mockCreate.mockResolvedValue({
            content: [{
                type: "text",
                text: JSON.stringify({ suggestions: ['Alpha', 'Beta', 'Gamma'] })
            }]
        });

        const handler = (await import('../../pages/api/random-character')).default;

        // First call
        const first = createMocks({ method: 'GET' });
        await handler(first.req, first.res);
        const firstData = first.res._getJSONData();
        expect(firstData.name).toBe('Alpha');

        // Second call - check exclusion list is in user message (Claude messages[0] is user)
        mockCreate.mockClear();
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({ suggestions: ['Beta', 'Gamma', 'Delta'] })
            }]
        });

        const second = createMocks({ method: 'GET' });
        await handler(second.req, second.res);

        // With Claude, messages[0] is the user message (system is top-level param)
        const callArgs = mockCreate.mock.calls[0]?.[0];
        expect(callArgs?.messages?.[0]?.content).toContain('Do NOT suggest any of these recently used names');
        expect(callArgs?.messages?.[0]?.content).toContain('Alpha');
    });

    it('uses creative and exploratory system prompt', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({ suggestions: ['Test'] })
            }]
        });

        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);

        // With Claude, system prompt is top-level `system` param
        const callArgs = mockCreate.mock.calls[0]?.[0];
        const systemPrompt = callArgs?.system;
        expect(systemPrompt).toContain('TRULY UNIQUE');
        expect(systemPrompt).toContain('creative');
        expect(systemPrompt).toContain('CATEGORY DISTRIBUTION');
        expect(systemPrompt).toContain('predictable');
        expect(systemPrompt).toContain('lesser-known');
    });

    it('requests category diversity in user prompt', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                type: "text",
                text: JSON.stringify({ suggestions: ['Test'] })
            }]
        });

        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);

        // With Claude, messages[0] is the user message
        const callArgs = mockCreate.mock.calls[0]?.[0];
        const userPrompt = callArgs?.messages?.[0]?.content;
        expect(userPrompt).toContain('DIFFERENT categories');
        expect(userPrompt).toContain('creative');
        expect(userPrompt).toContain('exploratory');
        expect(userPrompt).toContain('distinct category');
    });
});

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

        // name is chosen randomly from the pool
        expect(['Alpha', 'Bravo', 'Charlie', 'Delta']).toContain(firstData.name);
        // Second call returns entirely fresh names — none from the first batch
        expect(secondData.suggestions).toEqual(['Echo', 'Foxtrot', 'Golf', 'Hotel']);
        expect(['Echo', 'Foxtrot', 'Golf', 'Hotel']).toContain(secondData.name);
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
        expect(['Alpha', 'Beta', 'Gamma']).toContain(firstData.name);

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
        // firstData.name was randomly chosen from the pool, so it should appear in the exclusion list
        expect(callArgs?.messages?.[0]?.content).toContain(firstData.name);
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
        expect(systemPrompt).toContain('public domain');
        expect(systemPrompt).toContain('different culture');
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
        expect(userPrompt).toContain('diverse cultures');
        expect(userPrompt).toContain('public domain');
    });

    it('returns 500 when all suggestions are already in recentNames', async () => {
        const handler = (await import('../../pages/api/random-character')).default;

        // First call: populate recentNames with 'OldA' and 'OldB'
        mockCreate.mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify({ suggestions: ['OldA', 'OldB'] }) }]
        });
        const seed = createMocks({ method: 'GET' });
        await handler(seed.req, seed.res);
        expect(seed.res._getStatusCode()).toBe(200);

        // Second call: Claude returns only names already in recentNames → pool is empty → 500
        mockCreate.mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify({ suggestions: ['OldA', 'OldB'] }) }]
        });

        const second = createMocks({ method: 'GET' });
        await handler(second.req, second.res);
        expect(second.res._getStatusCode()).toBe(500);
        // Only one call was made for the second request (no retry)
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('skips empty-string suggestions during normalization (line 23 branch)', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify({ suggestions: ['', '  ', 'Merlin', 'Athena'] }) }]
        });
        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.suggestions).not.toContain('');
        expect(data.suggestions).not.toContain('  ');
        expect(data.suggestions).toContain('Merlin');
    });

    it('returns 500 when Claude response content is non-text and no suggestions parsed (lines 60-62 branch)', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ type: "image" }]
        });
        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
    });

    it('returns 500 when parsed JSON has no suggestions array (line 62 false branch)', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify({ data: ['Foo'] }) }]
        });
        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
    });

    it('trims recentNames to MAX_RECENT_NAMES (100) after accumulating more than 100 names (line 112)', async () => {
        const handler = (await import('../../pages/api/random-character')).default;

        // Make 11 calls with 10 unique names each (110 total) to exceed MAX_RECENT_NAMES
        for (let i = 0; i < 11; i++) {
            const names = Array.from({ length: 10 }, (_, j) => `Name_${i}_${j}`);
            mockCreate.mockResolvedValueOnce({
                content: [{ type: "text", text: JSON.stringify({ suggestions: names }) }]
            });
            const { req, res } = createMocks({ method: 'GET' });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(200);
        }

        // If the trim worked, the 12th call should still succeed
        mockCreate.mockResolvedValueOnce({
            content: [{ type: "text", text: JSON.stringify({ suggestions: ['FinalName'] }) }]
        });
        const { req: finalReq, res: finalRes } = createMocks({ method: 'GET' });
        await handler(finalReq, finalRes);
        expect(finalRes._getStatusCode()).toBe(200);
        expect(finalRes._getJSONData().name).toBe('FinalName');
    });

    it('returns 500 when Claude throws a non-Error value (cond-expr branch)', async () => {
        // Throw a plain string (non-Error) to exercise the String(err) branch
        mockCreate.mockRejectedValueOnce('raw string rejection');
        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
        expect(res._getJSONData()).toEqual({ error: 'Failed to generate random character' });
    });
});

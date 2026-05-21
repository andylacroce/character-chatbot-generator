import { createMocks } from 'node-mocks-http';

// Mock the static character names list so tests are deterministic
jest.mock('../../src/data/characterNames', () => ({
    __esModule: true,
    default: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
}));

describe('random-character API', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('returns 405 if method is not GET', async () => {
        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'POST' });
        handler(req, res);
        expect(res._getStatusCode()).toBe(405);
    });

    it('returns a name from the static list', async () => {
        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(typeof data.name).toBe('string');
        expect(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']).toContain(data.name);
    });

    it('does not repeat a recently chosen name', async () => {
        const handler = (await import('../../pages/api/random-character')).default;
        const chosen = new Set<string>();
        // With 5 names, 5 requests should produce 5 unique names
        for (let i = 0; i < 5; i++) {
            const { req, res } = createMocks({ method: 'GET' });
            handler(req, res);
            expect(res._getStatusCode()).toBe(200);
            chosen.add(res._getJSONData().name);
        }
        expect(chosen.size).toBe(5);
    });

    it('resets and continues working after exhausting all names', async () => {
        const handler = (await import('../../pages/api/random-character')).default;
        // Exhaust all 5 names
        for (let i = 0; i < 5; i++) {
            const { req, res } = createMocks({ method: 'GET' });
            handler(req, res);
        }
        // 6th request should succeed (pool resets)
        const { req, res } = createMocks({ method: 'GET' });
        handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']).toContain(res._getJSONData().name);
    });

    it('makes no external API calls', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch');
        const handler = (await import('../../pages/api/random-character')).default;
        const { req, res } = createMocks({ method: 'GET' });
        handler(req, res);
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });
});

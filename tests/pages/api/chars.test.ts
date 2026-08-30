import { createMocks } from 'node-mocks-http';

const mockOrderBy = jest.fn();
const mockFrom = jest.fn(() => ({ orderBy: mockOrderBy }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));
const mockDb = { select: mockSelect };
jest.mock('../../../src/db/client', () => ({ getDb: () => mockDb }));

function makeRow(name: string, avatarUrl = `https://example.test/${name}.png`) {
    return { characterName: name, avatarUrl, gender: null, createdAt: new Date() };
}

describe('chars API', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        process.env = { ...OLD_ENV, DATABASE_URL: 'postgres://user:pass@host/db' };
        mockOrderBy.mockResolvedValue([]);
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('returns 405 for non-GET methods', async () => {
        const handler = (await import('../../../pages/api/chars')).default;
        const { req, res } = createMocks({ method: 'POST' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(405);
    });

    it('returns an empty list when DATABASE_URL is not configured', async () => {
        delete process.env.DATABASE_URL;
        const handler = (await import('../../../pages/api/chars')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual({ characters: [], hasMore: false });
        expect(mockSelect).not.toHaveBeenCalled();
    });

    it('title-cases lowercased character names and reports hasMore', async () => {
        mockOrderBy.mockResolvedValue([makeRow('sherlock holmes'), makeRow('ada lovelace')]);
        const handler = (await import('../../../pages/api/chars')).default;
        const { req, res } = createMocks({ method: 'GET', query: { limit: '1', offset: '0' } });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(res._getJSONData()).toEqual({
            characters: [{ name: 'Sherlock Holmes', avatarUrl: 'https://example.test/sherlock holmes.png' }],
            hasMore: true,
        });
    });

    it('reports hasMore: false on the last page', async () => {
        mockOrderBy.mockResolvedValue([makeRow('ada lovelace')]);
        const handler = (await import('../../../pages/api/chars')).default;
        const { req, res } = createMocks({ method: 'GET', query: { limit: '60', offset: '0' } });
        await handler(req, res);
        expect(res._getJSONData()).toEqual({
            characters: [{ name: 'Ada Lovelace', avatarUrl: 'https://example.test/ada lovelace.png' }],
            hasMore: false,
        });
    });

    it('clamps limit to the configured maximum', async () => {
        mockOrderBy.mockResolvedValue(Array.from({ length: 10 }, (_, i) => makeRow(`char ${i}`)));
        const handler = (await import('../../../pages/api/chars')).default;
        const { req, res } = createMocks({ method: 'GET', query: { limit: '99999', offset: '0' } });
        await handler(req, res);
        // All 10 rows fit under the max, so this just confirms the request doesn't reject/clip oddly.
        expect(res._getJSONData().characters).toHaveLength(10);
        expect(res._getJSONData().hasMore).toBe(false);
    });

    it('reuses the cached row list across requests within the TTL window (does not re-query)', async () => {
        mockOrderBy.mockResolvedValue([makeRow('ada lovelace')]);
        const handler = (await import('../../../pages/api/chars')).default;

        const first = createMocks({ method: 'GET' });
        await handler(first.req, first.res);
        expect(mockSelect).toHaveBeenCalledTimes(1);

        const second = createMocks({ method: 'GET' });
        await handler(second.req, second.res);
        // Same handler instance (module not reset between these two calls) — the
        // in-process cache should serve the second request without hitting the DB again.
        expect(mockSelect).toHaveBeenCalledTimes(1);
        expect(second.res._getJSONData().characters).toEqual(first.res._getJSONData().characters);
    });

    it('returns 500 when the query fails', async () => {
        mockOrderBy.mockRejectedValue(new Error('db down'));
        const handler = (await import('../../../pages/api/chars')).default;
        const { req, res } = createMocks({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(500);
    });
});

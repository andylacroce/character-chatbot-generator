import { createMocks } from 'node-mocks-http';

const actualDrizzleOrm = jest.requireActual('drizzle-orm');
const mockEq = jest.fn((...args: unknown[]) => actualDrizzleOrm.eq(...args));
jest.mock('drizzle-orm', () => ({
    ...jest.requireActual('drizzle-orm'),
    eq: (...args: unknown[]) => mockEq(...args),
}));

const mockGetSessionUserId = jest.fn();
jest.mock('../../../src/utils/getSessionUserId', () => ({
    getSessionUserId: (...args: unknown[]) => mockGetSessionUserId(...args),
}));

const mockLimit = jest.fn();
const mockOrderBy = jest.fn(() => ({ limit: mockLimit }));
const mockWhere = jest.fn(() => ({ orderBy: mockOrderBy }));
const mockFrom = jest.fn(() => ({ where: mockWhere }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));

const mockOnConflictDoUpdate = jest.fn();
const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = jest.fn(() => ({ values: mockValues }));

const mockDb = { select: mockSelect, insert: mockInsert };
jest.mock('../../../src/db/client', () => ({ getDb: () => mockDb }));

describe('bots API', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...OLD_ENV, DATABASE_URL: 'postgres://user:pass@host/db' };
        mockLimit.mockResolvedValue([]);
        mockOnConflictDoUpdate.mockResolvedValue(undefined);
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('returns 405 for unsupported methods', async () => {
        const handler = (await import('../../../pages/api/bots')).default;
        const { req, res } = createMocks({ method: 'DELETE' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(405);
    });

    describe('guest / no-DB no-op', () => {
        it('GET returns an empty list for a guest (no session)', async () => {
            mockGetSessionUserId.mockResolvedValue(null);
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({ method: 'GET' });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(200);
            expect(res._getJSONData()).toEqual({ bots: [] });
            expect(mockSelect).not.toHaveBeenCalled();
        });

        it('POST is a no-op for a guest (no session)', async () => {
            mockGetSessionUserId.mockResolvedValue(null);
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({
                method: 'POST',
                body: { name: 'Sherlock Holmes', personality: 'A detective.' },
            });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(200);
            expect(res._getJSONData()).toEqual({ persisted: false });
            expect(mockInsert).not.toHaveBeenCalled();
        });

        it('is a no-op when signed in but DATABASE_URL is not configured', async () => {
            delete process.env.DATABASE_URL;
            mockGetSessionUserId.mockResolvedValue('user-1');
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({ method: 'GET' });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(200);
            expect(res._getJSONData()).toEqual({ bots: [] });
        });
    });

    describe('GET (signed in)', () => {
        beforeEach(() => mockGetSessionUserId.mockResolvedValue('user-1'));

        it('lists the signed-in user\'s bots, most recently updated first', async () => {
            const rows = [{ id: 'b1', name: 'Dracula' }, { id: 'b2', name: 'Cleopatra' }];
            mockLimit.mockResolvedValueOnce(rows);
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({ method: 'GET' });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(200);
            expect(res._getJSONData()).toEqual({ bots: rows });
            expect(mockFrom).toHaveBeenCalled();
        });

        it('caps the query at the 50 most recently updated characters', async () => {
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({ method: 'GET' });
            await handler(req, res);
            expect(mockLimit).toHaveBeenCalledWith(50);
        });

        it('returns 500 when the query fails', async () => {
            mockLimit.mockRejectedValueOnce(new Error('db down'));
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({ method: 'GET' });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(500);
        });

        it('scopes the query to the current VERCEL_ENV', async () => {
            process.env.VERCEL_ENV = 'production';
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({ method: 'GET' });
            await handler(req, res);
            expect(mockEq.mock.calls.some((call) => call[1] === 'production')).toBe(true);
        });

        it('defaults to "development" when VERCEL_ENV is unset (local dev)', async () => {
            delete process.env.VERCEL_ENV;
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({ method: 'GET' });
            await handler(req, res);
            expect(mockEq.mock.calls.some((call) => call[1] === 'development')).toBe(true);
        });
    });

    describe('POST (signed in)', () => {
        beforeEach(() => mockGetSessionUserId.mockResolvedValue('user-1'));

        it('rejects a missing name', async () => {
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({
                method: 'POST',
                body: { personality: 'A detective.' },
            });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(400);
        });

        it('rejects a missing personality', async () => {
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({
                method: 'POST',
                body: { name: 'Sherlock Holmes' },
            });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(400);
        });

        it('upserts on (userId, name, environment) and persists', async () => {
            process.env.VERCEL_ENV = 'preview';
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({
                method: 'POST',
                body: {
                    name: 'Sherlock Holmes',
                    personality: 'A detective.',
                    avatarUrl: 'https://blob.example.com/a.png',
                    gender: 'male',
                    voiceConfig: { languageCodes: ['en-US'], name: 'v', ssmlGender: 1 },
                },
            });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(200);
            expect(res._getJSONData()).toEqual({ persisted: true });
            expect(mockInsert).toHaveBeenCalled();
            expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
                userId: 'user-1',
                name: 'Sherlock Holmes',
                personality: 'A detective.',
                environment: 'preview',
            }));
            expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({
                target: expect.arrayContaining([]),
                set: expect.objectContaining({ personality: 'A detective.' }),
            }));
            // Upsert conflict target must include environment — otherwise the same
            // character name in different environments would collide on write.
            expect((mockOnConflictDoUpdate.mock.calls[0][0] as { target: unknown[] }).target).toHaveLength(3);
        });

        it('defaults optional fields to null', async () => {
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({
                method: 'POST',
                body: { name: 'Sherlock Holmes', personality: 'A detective.' },
            });
            await handler(req, res);
            expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
                avatarUrl: null,
                gender: null,
                voiceConfig: null,
            }));
        });

        it('returns 500 when the upsert fails', async () => {
            mockOnConflictDoUpdate.mockRejectedValueOnce(new Error('db down'));
            const handler = (await import('../../../pages/api/bots')).default;
            const { req, res } = createMocks({
                method: 'POST',
                body: { name: 'Sherlock Holmes', personality: 'A detective.' },
            });
            await handler(req, res);
            expect(res._getStatusCode()).toBe(500);
        });
    });
});

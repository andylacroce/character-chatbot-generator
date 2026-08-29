const mockNeon = jest.fn().mockReturnValue({ __neonClient: true });
const mockDrizzle = jest.fn().mockReturnValue({ __drizzleClient: true });

jest.mock('@neondatabase/serverless', () => ({
    neon: (...args: unknown[]) => mockNeon(...args),
}));
jest.mock('drizzle-orm/neon-http', () => ({
    drizzle: (...args: unknown[]) => mockDrizzle(...args),
}));

describe('db/client getDb', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        process.env = { ...OLD_ENV };
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('throws when DATABASE_URL is not configured', () => {
        delete process.env.DATABASE_URL;
        const { getDb } = require('../../../src/db/client');
        expect(() => getDb()).toThrow('Missing DATABASE_URL');
    });

    it('constructs a client from DATABASE_URL and caches it across calls', () => {
        process.env.DATABASE_URL = 'postgres://user:pass@host/db';
        const { getDb } = require('../../../src/db/client');

        const first = getDb();
        const second = getDb();

        expect(first).toBe(second);
        expect(mockNeon).toHaveBeenCalledTimes(1);
        expect(mockNeon).toHaveBeenCalledWith('postgres://user:pass@host/db');
        expect(mockDrizzle).toHaveBeenCalledTimes(1);
    });
});

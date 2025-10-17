jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

describe('cache fresh-get behavior', () => {
    beforeEach(() => {
        jest.resetModules();
        delete process.env.VERCEL_ENV;
        jest.clearAllMocks();
        const fs = jest.requireMock('fs') as {
            existsSync: jest.Mock;
            readFileSync: jest.Mock;
            writeFileSync: jest.Mock;
        };
        (fs.existsSync as jest.Mock).mockReturnValue(true);
    });

    it('returns value for fresh entry and saves updated timestamp', () => {
        const fs = jest.requireMock('fs') as {
            existsSync: jest.Mock;
            readFileSync: jest.Mock;
            writeFileSync: jest.Mock;
        };
        const now = Date.now();
        const fileCache: Record<string, any> = {
            foo: { value: 'bar', timestamp: now }
        };
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(fileCache));
        const cache = jest.requireActual('../src/utils/cache');
        const val = cache.getReplyCache('foo');
        expect(val).toBe('bar');
        // getReplyCache updates timestamp and calls saveCacheToFile -> writeFileSync
        expect(fs.writeFileSync).toHaveBeenCalled();
    });
});

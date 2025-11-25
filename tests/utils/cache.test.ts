jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));
// Use jest.requireMock to access the mocked fs module instead of require('fs')
const fs = jest.requireMock('fs') as {
    existsSync: jest.Mock;
    readFileSync: jest.Mock;
    writeFileSync: jest.Mock;
};

describe('cache utility', () => {
    const _CACHE_FILE = '/tmp/bot-reply-cache.json';
    beforeEach(() => {
        jest.resetModules();
        delete process.env.VERCEL_ENV;
        jest.clearAllMocks();
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (fs.readFileSync as jest.Mock).mockReset();
        (fs.writeFileSync as jest.Mock).mockReset();
    });

    function getCache() {
        // Always re-import the module after any env changes
        jest.resetModules();
        return jest.requireActual('../../src/utils/cache');
    }

    it('setReplyCache and getReplyCache use memory in Vercel', () => {
        process.env.VERCEL_ENV = '1';
        const cache = getCache();
        cache.setReplyCache('foo', 'bar');
        expect(cache.getReplyCache('foo')).toBe('bar');
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('setReplyCache and getReplyCache use file in non-Vercel', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        const fileCache = { foo: 'baz' };
        (fs.readFileSync as jest.Mock).mockImplementation(() => JSON.stringify(fileCache));
        const cache = getCache();
        expect(() => cache.setReplyCache('foo', 'bar')).not.toThrow();
    });

    it('getReplyCache returns null if not found', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('{"baz":"qux"}');
        const cache = getCache();
        expect(cache.getReplyCache('foo')).toBeNull();
    });

    it('handles file read error gracefully', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockImplementation(() => { throw new Error('fail'); });
        const cache = getCache();
        expect(cache.getReplyCache('foo')).toBeNull();
    });

    it('handles file write error gracefully', () => {
        (fs.writeFileSync as jest.Mock).mockImplementation(() => { throw new Error('fail'); });
        const cache = getCache();
        expect(() => cache.setReplyCache('foo', 'bar')).not.toThrow();
    });

    it('deleteReplyCache works in Vercel', () => {
        process.env.VERCEL_ENV = '1';
        const cache = getCache();
        cache.setReplyCache('foo', 'bar');
        expect(cache.getReplyCache('foo')).toBe('bar');
        cache.deleteReplyCache('foo');
        expect(cache.getReplyCache('foo')).toBeNull();
    });

    it('deleteReplyCache works in non-Vercel', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        const fileCache = { foo: 'bar' };
        (fs.readFileSync as jest.Mock).mockImplementation(() => JSON.stringify(fileCache));
        const cache = getCache();
        expect(() => cache.deleteReplyCache('foo')).not.toThrow();
    });

    it('handles JSON parse error gracefully', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('not-json');
        const cache = getCache();
        expect(cache.getReplyCache('foo')).toBeNull();
    });
});

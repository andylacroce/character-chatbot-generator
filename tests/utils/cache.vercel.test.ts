import { setReplyCache, getReplyCache, deleteReplyCache } from '../../src/utils/cache';

describe('cache in Vercel environment', () => {
  const OLD_ENV = process.env;
  let now = Date.now();
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, VERCEL_ENV: '1' };
    now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    (Date.now as jest.MockedFunction<typeof Date.now>).mockRestore?.();
    process.env = OLD_ENV;
  });

  it('set and get reply cache updates timestamp and returns value', () => {
    setReplyCache('k1', 'v1');
    expect(getReplyCache('k1')).toBe('v1');
    // Simulate access updates timestamp: advance time and get again
    const oldNow = now;
    now = now + 1000;
    (Date.now as jest.MockedFunction<typeof Date.now>).mockImplementation(() => now);
    expect(getReplyCache('k1')).toBe('v1');
    // Ensure it doesn't expire prematurely
    now = oldNow + (24 * 60 * 60 * 1000) - 1000; // just before TTL
    (Date.now as jest.MockedFunction<typeof Date.now>).mockImplementation(() => now);
    expect(getReplyCache('k1')).toBe('v1');
  });

  it('expired entry is removed and returns null', () => {
    // set entry with older timestamp by manipulating Date.now
    now = Date.now() - (24 * 60 * 60 * 1000) - 1000;
    (Date.now as jest.MockedFunction<typeof Date.now>).mockImplementation(() => now);
    setReplyCache('k-exp', 'v-exp');

    // advance beyond TTL
    now = Date.now();
    (Date.now as jest.MockedFunction<typeof Date.now>).mockImplementation(() => now + (24 * 60 * 60 * 1000) + 1);

    expect(getReplyCache('k-exp')).toBeNull();
  });

  it('deleteReplyCache removes key', () => {
    setReplyCache('k-del', 'v-del');
    expect(getReplyCache('k-del')).toBe('v-del');
    deleteReplyCache('k-del');
    expect(getReplyCache('k-del')).toBeNull();
  });
});
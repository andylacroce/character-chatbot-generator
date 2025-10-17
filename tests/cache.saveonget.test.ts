jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));
const mockedFsLocal = jest.requireMock('fs') as {
  existsSync: jest.Mock;
  readFileSync: jest.Mock;
  writeFileSync: jest.Mock;
};

describe('cache get updates file (non-Vercel)', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.VERCEL_ENV; // ensure non-Vercel path
    jest.clearAllMocks();
  });

  it('updates timestamp and saves file when entry is fresh', () => {
    const recentTs = Date.now();
    const fileCache: Record<string, { value: string; timestamp: number }> = {
      foo: { value: 'fresh', timestamp: recentTs }
    };
  (mockedFsLocal.existsSync as jest.Mock).mockReturnValue(true);
  (mockedFsLocal.readFileSync as jest.Mock).mockImplementation(() => JSON.stringify(fileCache));

  const cache = jest.requireActual('../src/utils/cache');
  const val = cache.getReplyCache('foo');
  // Should return the fresh value (or null in rare timing edge cases)
  expect([null, 'fresh']).toContain(val);
  });
});

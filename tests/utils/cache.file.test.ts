import fs from 'fs';
import { setReplyCache, getReplyCache, deleteReplyCache } from '../../src/utils/cache';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('cache file-based behavior', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV }; // ensure VERCEL_ENV not set
    mockedFs.existsSync.mockReset();
    mockedFs.readFileSync.mockReset();
    mockedFs.writeFileSync.mockReset();
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('getReplyCache returns value and saves updated timestamp', () => {
    const now = Date.now();
    const payload = { myKey: { value: 'file-val', timestamp: now } };
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(payload));

    const res = getReplyCache('myKey');
    expect(res).toBe('file-val');
    // should have saved updated timestamp via writeFileSync
    expect(mockedFs.writeFileSync).toHaveBeenCalled();
  });

  it('loadCacheFromFile handles invalid JSON gracefully', () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue('not json');

    // setReplyCache should not throw even if read returns invalid JSON
    expect(() => setReplyCache('k1', 'v1')).not.toThrow();
    // and writeFileSync should have been called to persist cleaned cache
    expect(mockedFs.writeFileSync).toHaveBeenCalled();
  });

  it('deleteReplyCache removes key and writes file', () => {
    const now = Date.now();
    const payload = { removeMe: { value: 'x', timestamp: now } };
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(payload));

    deleteReplyCache('removeMe');
    expect(mockedFs.writeFileSync).toHaveBeenCalled();
  });
});
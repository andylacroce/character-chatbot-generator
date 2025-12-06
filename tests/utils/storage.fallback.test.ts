import storage, { getItem, getJSON, getVersionedJSON } from '../../src/utils/storage';

describe('storage fallback (no localStorage)', () => {
  let originalLocalStorage: unknown;

  beforeEach(() => {
    // Save existing localStorage and delete it to simulate environments without it
    const g = global as unknown as Record<string, unknown>;
    originalLocalStorage = g.localStorage;
    try {
      delete g.localStorage;
    } catch {}
    storage.clearMemoryFallback();
  });

  afterEach(() => {
    // Restore original localStorage after test
    try {
      const g = global as unknown as Record<string, unknown>;
      g.localStorage = originalLocalStorage;
    } catch {}
    storage.clearMemoryFallback();
  });

  it('uses in-memory fallback for setItem/getItem/removeItem', () => {
    storage.setItem('foo', 'bar');
    expect(getItem('foo')).toBe('bar');
    storage.removeItem('foo');
    expect(getItem('foo')).toBeNull();
  });

  it('handles JSON helpers using fallback', () => {
    storage.setJSON('obj', { a: 1 });
    expect(getJSON<{ a: number }>('obj')).toEqual({ a: 1 });
    // Invalid JSON path should return null
    expect(getJSON('missing')).toBeNull();
  });

  it('stores and reads versioned JSON using fallback', () => {
    storage.setVersionedJSON('vr', { x: 42 }, 3);
    const read = getVersionedJSON<{ x: number }>('vr');
    expect(read).not.toBeNull();
    expect(read!.v).toBe(3);
    expect(read!.payload).toEqual({ x: 42 });
  });
});

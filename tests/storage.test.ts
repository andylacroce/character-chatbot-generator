import storage, { getVersionedJSON, migrateToVersioned } from '../src/utils/storage';

describe('storage migration helper', () => {
  beforeEach(() => {
    // Clear in-memory fallback
    storage.clearMemoryFallback();
    // Ensure global localStorage is clean for tests
    try { localStorage.clear(); } catch {}
  });

  it('migrates unversioned JSON into a versioned wrapper', () => {
    const key = 'voiceConfig-TestBot';
    const payload = { voice: 'test-voice', stability: 0.5 };
    // Simulate plain JSON saved in storage
    storage.setItem(key, JSON.stringify(payload));

    const migrated = migrateToVersioned<typeof payload>(key, 1);
    expect(migrated).not.toBeNull();
    expect(migrated!.v).toBe(1);
    expect(migrated!.payload).toEqual(payload);

    const read = getVersionedJSON<typeof payload>(key);
    expect(read).not.toBeNull();
    expect(read!.payload).toEqual(payload);
  });

  it('returns existing versioned record unchanged', () => {
    const key = 'voiceConfig-Existing';
    const wrapper = { v: 1, createdAt: new Date().toISOString(), payload: { voice: 'x' } };
    storage.setItem(key, JSON.stringify(wrapper));
    const migrated = migrateToVersioned(key, 2);
    expect(migrated).not.toBeNull();
    expect(migrated!.v).toBe(1); // unchanged
  });

  it('returns null for invalid JSON', () => {
    const key = 'voiceConfig-Bad';
    storage.setItem(key, 'not-json');
    const migrated = migrateToVersioned(key, 1);
    expect(migrated).toBeNull();
  });
});

import storage, { getVersionedJSON, migrateToVersioned, setVersionedJSON, setJSON, getJSON } from '../../src/utils/storage';

describe('storage migration helper', () => {
  beforeEach(() => {
    // Clear in-memory fallback before each test
    storage.clearMemoryFallback();
    // Ensure localStorage is clean before each test
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
    expect(migrated!.v).toBe(1); // Version should remain unchanged
  });

  it('returns null for invalid JSON', () => {
    const key = 'voiceConfig-Bad';
    storage.setItem(key, 'not-json');
    const migrated = migrateToVersioned(key, 1);
    expect(migrated).toBeNull();
  });

  it('applies transform function when migrating', () => {
    const key = 'voiceConfig-Transform';
    const payload = { oldField: 'value' };
    storage.setItem(key, JSON.stringify(payload));

    const transform = (p: unknown) => ({ newField: (p as { oldField: string }).oldField });
    const migrated = migrateToVersioned<{ newField: string }>(key, 1, transform);
    
    expect(migrated).not.toBeNull();
    expect(migrated!.payload).toEqual({ newField: 'value' });
  });

  it('returns null when key does not exist', () => {
    const migrated = migrateToVersioned('nonexistent-key', 1);
    expect(migrated).toBeNull();
  });

  it('handles setVersionedJSON and getVersionedJSON', () => {
    const key = 'test-versioned';
    const payload = { data: 'test' };
    
    setVersionedJSON(key, payload, 2);
    
    const retrieved = getVersionedJSON<typeof payload>(key);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.v).toBe(2);
    expect(retrieved!.payload).toEqual(payload);
    expect(retrieved!.createdAt).toBeDefined();
  });

  it('handles malformed versioned JSON gracefully', () => {
    const key = 'test-malformed';
    // Set malformed versioned JSON (missing required fields like createdAt and payload)
    storage.setItem(key, JSON.stringify({ v: 1 })); // Missing createdAt and payload fields
    
    const retrieved = getVersionedJSON(key);
    expect(retrieved).toBeNull();
  });

  it('handles setJSON and getJSON errors gracefully', () => {
    const key = 'test-json-errors';
    
    // Test circular reference (should fail stringify but not throw)
    const circular: { self?: unknown } = {};
    circular.self = circular;
    
    // Should not throw
    expect(() => setJSON(key, circular)).not.toThrow();
    
    // Store invalid JSON manually
    storage.setItem(key, 'invalid-json{]');
    
    // getJSON should return null for invalid JSON
    const result = getJSON(key);
    expect(result).toBeNull();
  });

  it('returns null for getJSON when key does not exist', () => {
    const result = getJSON('nonexistent');
    expect(result).toBeNull();
  });
});

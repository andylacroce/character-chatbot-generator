// Safe storage helpers with in-memory fallback for environments where localStorage is unavailable.
// Provides simple get/set/remove and JSON helpers with try/catch handling to keep callers clean.

const memoryFallback = new Map<string, string>();

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage;
  } catch {
    return false;
  }
}

export function setItem(key: string, value: string) {
  try {
    if (storageAvailable()) {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // fall through to memory fallback
  }
  memoryFallback.set(key, value);
}

export function getItem(key: string): string | null {
  try {
    if (storageAvailable()) return localStorage.getItem(key);
  } catch {
    // fall through
  }
  return memoryFallback.has(key) ? (memoryFallback.get(key) as string) : null;
}

export function removeItem(key: string) {
  try {
    if (storageAvailable()) {
      localStorage.removeItem(key);
      return;
    }
  } catch {
    // fall through
  }
  memoryFallback.delete(key);
}

export function setJSON(key: string, obj: unknown) {
  try {
    setItem(key, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

export function getJSON<T = unknown>(key: string): T | null {
  const raw = getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearMemoryFallback() {
  memoryFallback.clear();
}

// Versioned JSON helpers
export type VersionedRecord<T = unknown> = { v: number; createdAt: string; payload: T };

/**
 * Store an object with a version and timestamp wrapper. Use this for values that may need
 * schema migrations (e.g. voiceConfig-<name>).
 */
export function setVersionedJSON<T = unknown>(key: string, payload: T, version = 1) {
  try {
    const wrapper: VersionedRecord<T> = { v: version, createdAt: new Date().toISOString(), payload };
    setItem(key, JSON.stringify(wrapper));
  } catch {
    // ignore
  }
}

/**
 * Read a versioned record and return its payload if parseable. Returns null on parse/missing errors.
 */
export function getVersionedJSON<T = unknown>(key: string): VersionedRecord<T> | null {
  const raw = getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VersionedRecord<T>;
    if (parsed && typeof parsed.v === 'number' && parsed.createdAt && 'payload' in parsed) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt to migrate an existing unversioned JSON value at `key` into a versioned record.
 * - If the stored value is already a versioned record, returns it.
 * - If the stored value is unversioned JSON, it will be wrapped with the provided targetVersion
 *   and the wrapped record will be written back to storage.
 * - If parsing fails or there's no value, returns null.
 *
 * Optional `transform` can be provided to modify the parsed payload before storing.
 */
export function migrateToVersioned<T = unknown>(key: string, targetVersion = 1, transform?: (payload: unknown) => T): VersionedRecord<T> | null {
  const raw = getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Already versioned
    if (parsed && typeof parsed.v === 'number' && parsed.createdAt && 'payload' in parsed) {
      return parsed as VersionedRecord<T>;
    }
    const payload = transform ? transform(parsed) : parsed;
    const wrapper: VersionedRecord<T> = { v: targetVersion, createdAt: new Date().toISOString(), payload };
    try {
      setItem(key, JSON.stringify(wrapper));
    } catch {
      // ignore storage write errors
    }
    return wrapper;
  } catch {
    return null;
  }
}

const storageExports = { setItem, getItem, removeItem, setJSON, getJSON, clearMemoryFallback, setVersionedJSON, getVersionedJSON, migrateToVersioned };

export default storageExports;

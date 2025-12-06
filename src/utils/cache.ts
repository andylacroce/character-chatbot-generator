/**
 * Simple in-memory cache utility for API and TTS response caching.
 * Supports LRU eviction, TTL expiration, and both Vercel and local file persistence.
 */

import fs from "fs";

function isVercelEnv() {
  return !!process.env.VERCEL_ENV;
}

const CACHE_FILE = "/tmp/bot-reply-cache.json";
const MAX_CACHE_SIZE = 1000; // Maximum concurrent cache entries
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hour time-to-live in milliseconds

interface CacheEntry {
  value: string;
  timestamp: number;
}

const memoryCache: Map<string, CacheEntry> = new Map();

function loadCacheFromFile(): Map<string, CacheEntry> {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = fs.readFileSync(CACHE_FILE, "utf8");
      const parsed = JSON.parse(data);
      // Reconstruct Map from persisted plain object
      const cache = new Map<string, CacheEntry>();
      Object.entries(parsed).forEach(([key, entry]) => {
        cache.set(key, entry as CacheEntry);
      });
      return cache;
    } catch {
      return new Map();
    }
  }
  return new Map();
}

function saveCacheToFile(cache: Map<string, CacheEntry>) {
  try {
    // Serialize Map to plain object for JSON persistence
    const obj: Record<string, CacheEntry> = {};
    cache.forEach((value, key) => {
      obj[key] = value;
    });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj), "utf8");
  } catch { }
}

function cleanupExpiredEntries(cache: Map<string, CacheEntry>): Map<string, CacheEntry> {
  const now = Date.now();
  const cleaned = new Map<string, CacheEntry>();
  
  // Remove expired entries and enforce size limits
  const validEntries: Array<[string, CacheEntry]> = [];
  cache.forEach((entry, key) => {
    if (now - entry.timestamp < CACHE_TTL) {
      validEntries.push([key, entry]);
    }
  });
  
  // Sort by access time (LRU) and keep only most recent entries
  validEntries
    .sort((a, b) => b[1].timestamp - a[1].timestamp)
    .slice(0, MAX_CACHE_SIZE)
    .forEach(([key, entry]) => {
      cleaned.set(key, entry);
    });
    
  return cleaned;
}

/**
 * Sets a reply in the cache (in-memory or file-based depending on environment).
 * @param {string} key - The cache key.
 * @param {string} value - The value to cache.
 */
export function setReplyCache(key: string, value: string) {
  const entry: CacheEntry = {
    value,
    timestamp: Date.now()
  };
  
  if (isVercelEnv()) {
    memoryCache.set(key, entry);
    // Trigger cleanup if cache grows too large
    if (memoryCache.size > MAX_CACHE_SIZE) {
      const cleaned = cleanupExpiredEntries(memoryCache);
      memoryCache.clear();
      cleaned.forEach((entry, key) => memoryCache.set(key, entry));
    }
  } else {
    const cache = loadCacheFromFile();
    cache.set(key, entry);
    const cleaned = cleanupExpiredEntries(cache);
    saveCacheToFile(cleaned);
  }
}

/**
 * Retrieves a reply from the cache.
 * @param {string} key - The cache key.
 * @returns {string|null} The cached value or null if not found or expired.
 */
export function getReplyCache(key: string): string | null {
  if (isVercelEnv()) {
    const entry = memoryCache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      // Update timestamp for LRU eviction tracking
      entry.timestamp = Date.now();
      return entry.value;
    } else if (entry) {
      // Remove expired entry
      memoryCache.delete(key);
    }
    return null;
  } else {
    const cache = loadCacheFromFile();
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      // Update timestamp and save
      entry.timestamp = Date.now();
      saveCacheToFile(cache);
      return entry.value;
    } else if (entry) {
      // Remove expired entry
      cache.delete(key);
      saveCacheToFile(cache);
    }
    return null;
  }
}

/**
 * Deletes a reply from the cache.
 * @param {string} key - The cache key.
 */
export function deleteReplyCache(key: string) {
  if (isVercelEnv()) {
    memoryCache.delete(key);
  } else {
    const cache = loadCacheFromFile();
    cache.delete(key);
    saveCacheToFile(cache);
  }
}

// =============================
// cache.ts
// Simple in-memory cache utilities for API and TTS response caching.
// Used for rate limiting, reply caching, and audio file caching.
// =============================

import fs from "fs";

const isVercel = !!process.env.VERCEL_ENV;
const CACHE_FILE = "/tmp/bot-reply-cache.json";
const memoryCache: Record<string, string> = {};

function loadCacheFromFile(): Record<string, string> {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = fs.readFileSync(CACHE_FILE, "utf8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return {};
}

function saveCacheToFile(cache: Record<string, string>) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), "utf8");
  } catch {}
}

/**
 * Sets a reply in the cache (in-memory or file-based depending on environment).
 * @param {string} key - The cache key.
 * @param {string} value - The value to cache.
 */
export function setReplyCache(key: string, value: string) {
  if (isVercel) {
    memoryCache[key] = value;
  } else {
    const cache = loadCacheFromFile();
    cache[key] = value;
    saveCacheToFile(cache);
  }
}

/**
 * Retrieves a reply from the cache.
 * @param {string} key - The cache key.
 * @returns {string|null} The cached value or null if not found.
 */
export function getReplyCache(key: string): string | null {
  if (isVercel) {
    return memoryCache[key] || null;
  } else {
    const cache = loadCacheFromFile();
    return cache[key] || null;
  }
}

/**
 * Deletes a reply from the cache.
 * @param {string} key - The cache key.
 */
export function deleteReplyCache(key: string) {
  if (isVercel) {
    delete memoryCache[key];
  } else {
    const cache = loadCacheFromFile();
    delete cache[key];
    saveCacheToFile(cache);
  }
}

/**
 * Rate limiting middleware to prevent API abuse.
 * Implements IP-based request limiting using LRU cache.
 *
 * Features:
 * - Limits each IP to 100 requests per 15 minutes (configurable)
 * - Tracks request counts and window reset per IP
 * - Responds with 429 and logs when limit is exceeded
 * - Sets the following headers on all responses:
 *     - X-RateLimit-Limit: Maximum requests allowed per window
 *     - X-RateLimit-Remaining: Requests remaining in the current window
 *     - X-RateLimit-Reset: Unix timestamp (seconds) when the window resets
 *     - Retry-After: (on 429) Seconds until the next allowed request
 *
 * @module rateLimiter
 */

import { NextApiRequest, NextApiResponse } from "next";
import logger from "../utils/logger";

/**
 * Simple in-memory cache implementation for use in tests and as fallback.
 * @internal
 */
class InMemoryCache {
  private cache = new Map<string, unknown>();
  private options: Record<string, unknown>;

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  /**
   * Get a value from the cache.
   * @param {string} key
   * @returns {any}
   */
  get(key: string) {
    return this.cache.get(key);
  }

  /**
   * Set a value in the cache.
   * @param {string} key
   * @param {any} value
   * @returns {boolean}
   */
  set(key: string, value: unknown) {
    this.cache.set(key, value);
    return true;
  }
}

// Remove unused variable 'LRUCache' and use const for CacheImplementation
const CacheImplementation = InMemoryCache;

/**
 * Configuration options for the rate limiter.
 * @const
 * @type {{ maxRequests: number, windowMs: number }}
 */
const rateLimitOptions = {
  maxRequests: 100, // Limit each IP to 100 requests
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
};

/**
 * Interface defining the structure of rate limit data for each IP.
 * @interface RateLimitData
 * @property {number} count - Number of requests made in the current window
 * @property {number} resetTime - Timestamp when the rate limit window resets
 */
interface RateLimitData {
  count: number;
  resetTime: number;
}

/**
 * LRU Cache instance for storing rate limit data by IP address.
 * Uses time-based expiration to automatically clean up old entries.
 * @internal
 */
const rateLimiterCache = new CacheImplementation({
  max: 5000, // Maximum number of IPs to store in cache
  ttl: rateLimitOptions.windowMs, // Time-to-live for each entry
  allowStale: false, // Ensure stale items are not returned
});

/**
 * Extracts the client IP address from the request.
 * Handles various proxy scenarios by checking x-forwarded-for header.
 * @param {NextApiRequest} req - The Next.js API request object
 * @returns {string|null} The client's IP address or null if not found
 */
const extractClientIp = (req: NextApiRequest): string | null => {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string") {
    return xForwardedFor.split(",")[0].trim(); // Extract the first IP
  }
  return req.socket?.remoteAddress || null;
};

/**
 * Rate limiting middleware function.
 * Tracks request counts by IP address and enforces limits.
 * Responds with 429 status when limits are exceeded.
 * @param {NextApiRequest} req - The Next.js API request object
 * @param {NextApiResponse} res - The Next.js API response object
 * @param {Function} next - The function to call when the request should proceed
 * @returns {Promise<void>} Resolves when request is allowed or blocked
 */
const rateLimiter = async (
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void,
) => {
  // Get client IP address
  const ip = extractClientIp(req);

  // Handle missing IP address
  if (!ip) {
    logger.info(`[RateLimiter] 429 Too Many Requests for IP: unknown`, { ip: null });
    return res
      .status(429)
      .json({ error: "Unable to determine client IP address." });
  }

  const currentTime = Date.now();
  // When retrieving from cache, assert or check type before use
  const rateDataRaw = rateLimiterCache.get(ip);
  let rateData: RateLimitData;
  if (
    typeof rateDataRaw === 'object' &&
    rateDataRaw !== null &&
    'count' in rateDataRaw &&
    'resetTime' in rateDataRaw &&
    typeof (rateDataRaw as RateLimitData).count === 'number' &&
    typeof (rateDataRaw as RateLimitData).resetTime === 'number'
  ) {
    rateData = rateDataRaw as RateLimitData;
  } else {
    rateData = { count: 0, resetTime: Date.now() };
  }

  // First request from this IP
  if (rateData.count === 0) {
    // Initialize rate data for new IP
    rateData.count = 1;
    rateData.resetTime = currentTime + rateLimitOptions.windowMs;
    rateLimiterCache.set(ip, rateData);
    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", rateLimitOptions.maxRequests);
    res.setHeader("X-RateLimit-Remaining", rateLimitOptions.maxRequests - 1);
    res.setHeader("X-RateLimit-Reset", Math.floor(rateData.resetTime / 1000));
    return next();
  }

  // Reset counter if the time window has expired
  if (currentTime > rateData.resetTime) {
    // Reset count after the time window expires
    rateData.count = 1;
    rateData.resetTime = currentTime + rateLimitOptions.windowMs;
    rateLimiterCache.set(ip, rateData);
    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", rateLimitOptions.maxRequests);
    res.setHeader("X-RateLimit-Remaining", rateLimitOptions.maxRequests - 1);
    res.setHeader("X-RateLimit-Reset", Math.floor(rateData.resetTime / 1000));
    return next();
  }

  // Check if rate limit exceeded
  if (rateData.count >= rateLimitOptions.maxRequests) {
    rateLimiterCache.set(ip, rateData); // Ensure the cache is updated before responding
    const retryAfter = Math.ceil((rateData.resetTime - currentTime) / 1000);
    // Log the rate limit event
    logger.info(`[RateLimiter] 429 Too Many Requests for IP: ${ip}`, { ip });
    // Set headers
    res.setHeader("Retry-After", retryAfter);
    res.setHeader("X-RateLimit-Limit", rateLimitOptions.maxRequests);
    res.setHeader("X-RateLimit-Remaining", 0);
    res.setHeader("X-RateLimit-Reset", Math.floor(rateData.resetTime / 1000));
    return res.status(429).json({
      error: "Too many requests, please try again later.",
      retryAfter,
    });
  }

  // Increment request count
  rateData.count += 1;
  rateLimiterCache.set(ip, rateData);
  // Set rate limit headers
  res.setHeader("X-RateLimit-Limit", rateLimitOptions.maxRequests);
  res.setHeader(
    "X-RateLimit-Remaining",
    rateLimitOptions.maxRequests - rateData.count,
  );
  res.setHeader("X-RateLimit-Reset", Math.floor(rateData.resetTime / 1000));
  next();
};

export default rateLimiter;

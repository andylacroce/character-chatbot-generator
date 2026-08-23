import { createRateLimiter, getClientIp } from '../../src/utils/rateLimit';
import { createRateLimitStore, RedisRestStore } from '../../src/utils/rateLimitStore';
import type { NextApiRequest } from 'next';

function makeReq(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    headers: {},
    socket: {},
    ...overrides,
  } as unknown as NextApiRequest;
}

// ---------------------------------------------------------------------------
// getClientIp
// ---------------------------------------------------------------------------

describe('getClientIp', () => {
  it('uses the first value from x-forwarded-for', () => {
    const req = makeReq({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = makeReq({ headers: { 'x-real-ip': '9.10.11.12' } });
    expect(getClientIp(req)).toBe('9.10.11.12');
  });

  it('falls back to socket.remoteAddress when both headers are absent', () => {
    const req = makeReq({ headers: {}, socket: { remoteAddress: '127.0.0.1' } as never });
    expect(getClientIp(req)).toBe('127.0.0.1');
  });

  it('returns "unknown" when no IP source is available', () => {
    const req = makeReq({ headers: {}, socket: {} as never });
    expect(getClientIp(req)).toBe('unknown');
  });

  it('trims whitespace from x-forwarded-for entries', () => {
    const req = makeReq({ headers: { 'x-forwarded-for': '  10.0.0.1  , 10.0.0.2' } });
    expect(getClientIp(req)).toBe('10.0.0.1');
  });
});

// ---------------------------------------------------------------------------
// createRateLimiter
// ---------------------------------------------------------------------------

describe('createRateLimiter', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns a middleware function', () => {
    const limiter = createRateLimiter({ name: 'test', max: 10, message: 'Too many requests' });
    expect(typeof limiter).toBe('function');
  });

  it('accepts a custom windowMs', () => {
    const limiter = createRateLimiter({
      name: 'test-window',
      max: 5,
      message: 'Too many requests',
      windowMs: 30 * 1000,
    });
    expect(typeof limiter).toBe('function');
  });

  it('uses the in-process store when no shared store is configured', () => {
    // Local development path: no Redis env vars, so express-rate-limit keeps its
    // own MemoryStore and `npm run dev` needs no extra infrastructure.
    expect(createRateLimitStore('test')).toBeUndefined();
  });

  it('uses the shared store when Redis is configured', () => {
    process.env.KV_REST_API_URL = 'https://redis.example';
    process.env.KV_REST_API_TOKEN = 'token';

    const store = createRateLimitStore('chat');
    expect(store).toBeInstanceOf(RedisRestStore);
    expect(store?.localKeys).toBe(false);
  });

  it('namespaces counters per route so routes do not share a budget', () => {
    process.env.KV_REST_API_URL = 'https://redis.example';
    process.env.KV_REST_API_TOKEN = 'token';

    expect(createRateLimitStore('chat')?.prefix).toBe('rl:chat:');
    expect(createRateLimitStore('audio')?.prefix).toBe('rl:audio:');
  });
});

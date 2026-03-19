import { createRateLimiter, getClientIp } from '../../src/utils/rateLimit';
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
  it('returns a middleware function', () => {
    const limiter = createRateLimiter(10, 'Too many requests');
    expect(typeof limiter).toBe('function');
  });

  it('accepts a custom windowMs', () => {
    const limiter = createRateLimiter(5, 'Too many requests', 30 * 1000);
    expect(typeof limiter).toBe('function');
  });
});

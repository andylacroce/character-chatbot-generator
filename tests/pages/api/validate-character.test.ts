
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock logger
const mockLogEvent = jest.fn();
const mockSanitize = jest.fn((m: unknown) => m);
jest.mock('../../../src/utils/logger', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => mockSanitize(m) }));

// Mock openai to control responses
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return function OpenAIMock() {
    return { chat: { completions: { create: mockCreate } } };
  };
});

// Mock model selector
jest.mock('../../../src/utils/openaiModelSelector', () => ({ getOpenAIModel: (_: string) => 'gpt-test' }));

// Now that mocks are set up, require the handler module
const handler = require('../../../pages/api/validate-character').default;

function makeRes() {
  const res: Partial<NextApiResponse> = {};
  res.status = jest.fn().mockReturnValue(res as NextApiResponse);
  res.json = jest.fn().mockReturnValue(res as NextApiResponse);
  return res as NextApiResponse;
}

describe('validate-character API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 405 for non-POST methods', async () => {
    const req = { method: 'GET' } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
    expect(mockLogEvent).toHaveBeenCalledWith('warn', 'validate_character_method_not_allowed', 'Validate character API method not allowed', expect.any(Object));
  });

  it('returns 400 for missing or invalid name', async () => {
    const req = { method: 'POST', body: { name: '   ' } } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Valid character name required' });
  });

  it('falls back to safe response when OpenAI returns invalid JSON', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '{ not valid json' } }] });
    const req = { method: 'POST', body: { name: 'SomeName' } } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ characterName: 'SomeName', isSafe: true, warningLevel: 'none' }));
    expect(mockLogEvent).toHaveBeenCalledWith('error', 'character_validation_failed', 'Failed to validate character', expect.any(Object));
  });

  it('parses valid OpenAI JSON and returns validation result', async () => {
    const content = JSON.stringify({ isPublicDomain: false, isSafe: false, warningLevel: 'warning', reason: 'Trademarked', suggestions: ['Alt1', 'Alt2'] });
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content } }] });
    const req = { method: 'POST', body: { name: 'MyHero' } } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ characterName: 'MyHero', isPublicDomain: false, isSafe: false, warningLevel: 'warning', suggestions: ['Alt1', 'Alt2'] }));
    expect(mockLogEvent).toHaveBeenCalledWith('info', 'character_validated', 'Character validation completed', expect.any(Object));
  });

  it('returns early when rate limiter sets headersSent (429)', async () => {
    // Reset modules so we can re-mock express-rate-limit to simulate a rate-limited response
    jest.resetModules();

    // Prepare local mocks for re-required module
    const localMockCreate = jest.fn();
    jest.mock('openai', () => {
      return function OpenAIMock() {
        return { chat: { completions: { create: localMockCreate } } };
      };
    });

    const localMockLog = jest.fn();
    jest.mock('../../../src/utils/logger', () => ({ logEvent: (...args: unknown[]) => localMockLog(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => m }));
    jest.mock('../../../src/utils/openaiModelSelector', () => ({ getOpenAIModel: (_: string) => 'gpt-test' }));

    // Mock express-rate-limit to immediately send a 429 response and mark headersSent
    jest.mock('express-rate-limit', () => {
      return jest.fn().mockImplementation(() => {
        return (req: Partial<NextApiRequest>, res: Partial<NextApiResponse>, next: () => void) => {
          res.status?.(429 as unknown as number);
          res.json?.({ error: 'Too many validation requests' } as unknown as object);
          // mark headersSent so handler returns early
          (res as Partial<NextApiResponse> & { headersSent?: boolean }).headersSent = true;
          next();
        };
      });
    });

    // Re-require handler after our mocks
    const handler2 = require('../../../pages/api/validate-character').default;

    const req = { method: 'POST', body: { name: 'Spam' } } as Partial<NextApiRequest> as NextApiRequest;
    const res = makeRes();

    await handler2(req, res);

    // Rate-limiter should have sent the 429 and handler should return early (no OpenAI call)
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many validation requests' });
    expect(localMockCreate).not.toHaveBeenCalled();
  });
});

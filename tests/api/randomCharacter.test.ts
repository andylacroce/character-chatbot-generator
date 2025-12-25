import { createMocks } from 'node-mocks-http';

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({ suggestions: ['Sherlock Holmes', 'Robin Hood', 'Hercules'] })
            }
          }]
        })
      }
    }
  }));
});

jest.mock("../../src/utils/openaiModelSelector", () => ({
  getOpenAIModel: (type: "text" | "image") => {
    if (type === "text") return "gpt-4o";
    throw new Error("Unknown type");
  }
}));

describe('random-character API', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns 405 if method is not GET', async () => {
    const handler = (await import('../../pages/api/random-character')).default;
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('returns suggestions and a chosen name when OpenAI responds with suggestions', async () => {
    const handler = (await import('../../pages/api/random-character')).default;
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);
    expect(typeof data.name).toBe('string');
    expect(data.suggestions).toContain(data.name);
  });

  it('handles OpenAI errors gracefully and falls back to defaults', async () => {
    const OpenAI = require('openai');
    OpenAI.mockImplementation(() => ({
      chat: { completions: { create: jest.fn().mockRejectedValue(new Error('OpenAI API error')) } }
    }));

    const handler = (await import('../../pages/api/random-character')).default;
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);
    expect(typeof data.name).toBe('string');
  });
});
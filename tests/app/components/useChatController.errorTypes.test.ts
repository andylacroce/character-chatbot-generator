import { renderHook, act } from '@testing-library/react';
import { useChatController } from '../../../app/components/useChatController';

const mockAuthenticatedFetch = jest.fn();
jest.mock('../../../src/utils/api', () => ({ authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])) }));

const mockLogEvent = jest.fn();
jest.mock('../../../src/utils/logger', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])), sanitizeLogMeta: (m: unknown) => m }));

const mockLoadVoiceConfig = jest.fn();
jest.mock('../../../src/utils/voiceConfigPersistence', () => ({ loadVoiceConfig: (...args: unknown[]) => mockLoadVoiceConfig(...(args as unknown[])), persistVoiceConfig: jest.fn() }));

import type { Bot } from '../../../app/components/BotCreator';

const bot: Bot = { name: 'ErrBot', personality: 'p', avatarUrl: '', voiceConfig: { name: 'v', languageCodes: ['en-US'], ssmlGender: 1, pitch: 0, rate: 1, type: 'Wavenet' } } as Bot;

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadVoiceConfig.mockReturnValue(bot.voiceConfig);
});

test('sendMessage handles non-Error throw (plain string) and logs appropriately', async () => {
  // Health check resolves, but chat API will reject with a plain string
  mockAuthenticatedFetch.mockImplementation((url: string) => {
    if (url === '/api/health') return Promise.resolve({ ok: true } as unknown as Response);
    if (url === '/api/chat') return Promise.reject('plain string');
    return Promise.resolve({ ok: true } as unknown as Response);
  });

  const { result } = renderHook(() => useChatController(bot));

  // Set input and call sendMessage
  act(() => { result.current.setInput('hello'); });

  await act(async () => {
    await result.current.sendMessage();
  });

  expect(result.current.error).toBeTruthy();
  // Logging should have been called with error category
  expect(mockLogEvent).toHaveBeenCalled();
});

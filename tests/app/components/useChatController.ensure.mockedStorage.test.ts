/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, waitFor } from '@testing-library/react';

// Mock storage before importing the hook
jest.mock('../../../src/utils/storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  setVersionedJSON: jest.fn(),
  getVersionedJSON: jest.fn(),
}));

// Also mock authenticatedFetch to allow mocking per-test
jest.mock('../../../src/utils/api');
// Mock the api_getVoiceConfigForCharacter used by the controller
jest.mock('../../../app/components/api_getVoiceConfigForCharacter');

import { api_getVoiceConfigForCharacter } from '../../../app/components/api_getVoiceConfigForCharacter';
import { authenticatedFetch } from '../../../src/utils/api';
import * as storage from '../../../src/utils/storage';
import { useChatController } from '../../../app/components/useChatController';

const mockGetVoice = api_getVoiceConfigForCharacter as jest.MockedFunction<typeof api_getVoiceConfigForCharacter>;
const mockAuth = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;

beforeEach(() => {
  jest.resetAllMocks();
  // default: health check ok and chat returns a reply
  mockAuth.mockImplementation((url: string) => {
    if (url === '/api/health') return Promise.resolve({ ok: true } as any);
    if (url === '/api/chat') return Promise.resolve({ ok: true, json: async () => ({ reply: 'From API' }) } as any);
    return Promise.resolve({ ok: true, json: async () => ({}) } as any);
  });
});

describe('ensureVoiceConfig branches (mocked storage)', () => {
  it('handles invalid JSON from saved bot gracefully and falls back to API', async () => {
    mockGetVoice.mockResolvedValue({ name: 'api-voice', languageCodes: ['en-US'], ssmlGender: 1, pitch: 0, rate: 1 } as any);
    (storage.getItem as jest.Mock).mockImplementation((key: string) => key === 'chatbot-bot' ? 'invalid{' : null);

    const bot = { name: 'ParseBot', personality: 'p', avatarUrl: '', voiceConfig: null, gender: null } as any;
    const { result } = renderHook(() => useChatController(bot));

    await waitFor(() => expect(result.current.messages.length).toBeGreaterThanOrEqual(1));
    expect(mockGetVoice).toHaveBeenCalledWith('ParseBot', null);
  });

  it('falls through when saved bot name does not match', async () => {
    mockGetVoice.mockResolvedValue({ name: 'api-voice', languageCodes: ['en-US'], ssmlGender: 1, pitch: 0, rate: 1 } as any);
    const saved = { name: 'Other' };
    (storage.getItem as jest.Mock).mockImplementation((key: string) => key === 'chatbot-bot' ? JSON.stringify(saved) : null);

    const bot = { name: 'MismatchBot', personality: 'p', avatarUrl: '', voiceConfig: null, gender: null } as any;
    const { result } = renderHook(() => useChatController(bot));

    await waitFor(() => expect(result.current.messages.length).toBeGreaterThanOrEqual(1));
    expect(result.current.messages[0].text).toBe('From API');
  });
});

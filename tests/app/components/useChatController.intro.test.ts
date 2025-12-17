/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, waitFor } from '@testing-library/react';
import { useChatController } from '../../../app/components/useChatController';
import { api_getVoiceConfigForCharacter } from '../../../app/components/api_getVoiceConfigForCharacter';
import { authenticatedFetch } from '../../../src/utils/api';

jest.mock('../../../app/components/api_getVoiceConfigForCharacter');
jest.mock('../../../src/utils/api');

const mockGetVoice = api_getVoiceConfigForCharacter as jest.MockedFunction<typeof api_getVoiceConfigForCharacter>;
const mockAuth = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;

describe('useChatController - intro generation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches intro and appends intro message when voiceConfig available', async () => {
    const bot = { name: 'IntroBot', personality: 'p', avatarUrl: '', voiceConfig: null, gender: null } as any;

    // ensure ensureVoiceConfig will fetch via api_getVoiceConfigForCharacter
    mockGetVoice.mockResolvedValue({ name: 'en-US-Voice', languageCodes: ['en-US'], ssmlGender: 1, pitch: 0, rate: 1 } as any);

    // health check succeeds
    mockAuth.mockImplementation((url: string) => {
      if (url === '/api/health') return Promise.resolve({ ok: true } as any);
      if (url === '/api/chat') return Promise.resolve({ ok: true, json: async () => ({ reply: 'Hello', audioFileUrl: 'https://audio' }) } as any);
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    const { result } = renderHook(() => useChatController(bot));

    await waitFor(() => expect(result.current.apiAvailable).toBe(true));

    // Wait for intro message to be set
    await waitFor(() => expect(result.current.messages.length).toBeGreaterThanOrEqual(1));

    const intro = result.current.messages[0];
    expect(intro.sender).toBe('IntroBot');
    expect(intro.text).toBe('Hello');
    expect(intro.audioFileUrl).toBe('https://audio');
  });

  it('sets introError when intro generation fails due to missing voiceConfig', async () => {
    const bot = { name: 'NoVoiceBot', personality: 'p', avatarUrl: '', voiceConfig: null, gender: null } as any;

    // ensure fetching voice config fails
    mockGetVoice.mockRejectedValue(new Error('no voice'));

    mockAuth.mockImplementation((url: string) => {
      if (url === '/api/health') return Promise.resolve({ ok: true } as any);
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    const { result } = renderHook(() => useChatController(bot));

    await waitFor(() => expect(result.current.apiAvailable).toBe(true));

    await waitFor(() => expect(result.current.introError).toBeTruthy());
  });
});
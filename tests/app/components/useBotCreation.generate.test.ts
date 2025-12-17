/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateBotDataWithProgressCancelable } from '../../../app/components/useBotCreation';
import { api_getVoiceConfigForCharacter } from '../../../app/components/api_getVoiceConfigForCharacter';
import { persistVoiceConfig } from '../../../src/utils/voiceConfigPersistence';
import { authenticatedFetch } from '../../../src/utils/api';

jest.mock('../../../app/components/api_getVoiceConfigForCharacter');
jest.mock('../../../src/utils/voiceConfigPersistence');
jest.mock('../../../src/utils/api');

const mockFetch = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;
const mockGetVoice = api_getVoiceConfigForCharacter as jest.MockedFunction<typeof api_getVoiceConfigForCharacter>;
const mockPersist = persistVoiceConfig as jest.MockedFunction<typeof persistVoiceConfig>;

describe('generateBotDataWithProgressCancelable (unit tests)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('succeeds with non-silhouette avatar and voice config', async () => {
    // personality -> ok
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({ personality: 'p' }) } as any);
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png', gender: 'female' }) } as any);
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });
    mockGetVoice.mockResolvedValueOnce({ name: 'en-US-Voice', languageCodes: ['en-US'], ssmlGender: 1, pitch: 0, rate: 1 });

    const cancelRef = { current: false } as any;
    const onProgress = jest.fn();
    const setLoadingMessage = jest.fn();

    const bot = await generateBotDataWithProgressCancelable('Alice', onProgress, setLoadingMessage, cancelRef);

    expect(bot.avatarUrl).toBe('/img.png');
    expect(bot.voiceConfig).toBeDefined();
    expect(mockPersist).toHaveBeenCalledWith('Alice', expect.any(Object));
  });

  it('uses default image when avatar API returns not ok', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({}) } as any);
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: false, status: 500 } as any);
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });
    mockGetVoice.mockResolvedValueOnce({ name: 'en-US-Voice', languageCodes: ['en-US'], ssmlGender: 1, pitch: 0, rate: 1 });

    const bot = await generateBotDataWithProgressCancelable('Bob', jest.fn(), jest.fn(), { current: false } as any);
    expect(bot.avatarUrl).toBe('/silhouette.svg');
  });

  it('throws when voice config generation fails', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({}) } as any);
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png' }) } as any);
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });
    mockGetVoice.mockRejectedValueOnce(new Error('no voice'));

    await expect(generateBotDataWithProgressCancelable('Carol', jest.fn(), jest.fn(), { current: false } as any)).rejects.toThrow(/Failed to generate a consistent voice/);
  });

  it('respects cancellation before personality step', async () => {
    // cancel current is true
    await expect(generateBotDataWithProgressCancelable('X', jest.fn(), jest.fn(), { current: true } as any)).rejects.toThrow('cancelled');
  });

  it('cancels when cancelRequested during avatar generation', async () => {
    // personality resolves immediately, avatar will be delayed
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({}) } as any);
      if (url === '/api/generate-avatar') return new Promise((res) => setTimeout(() => res({ ok: true, json: async () => ({ avatarUrl: '/img.png' }) }), 50)) as any;
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });
    mockGetVoice.mockResolvedValueOnce({ name: 'en-US-Voice', languageCodes: ['en-US'], ssmlGender: 1, pitch: 0, rate: 1 });

    const cancelRef = { current: false } as any;
    const create = generateBotDataWithProgressCancelable('D', jest.fn(), jest.fn(), cancelRef);
    // cancel before avatar resolves
    cancelRef.current = true;
    await expect(create).rejects.toThrow('cancelled');
  });

  it('continues even if persistVoiceConfig throws', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({}) } as any);
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png' }) } as any);
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });
    mockGetVoice.mockResolvedValueOnce({ name: 'en-US-Voice', languageCodes: ['en-US'], ssmlGender: 1, pitch: 0, rate: 1 });
    mockPersist.mockImplementation(() => { throw new Error('persist fail'); });

    const bot = await generateBotDataWithProgressCancelable('Eve', jest.fn(), jest.fn(), { current: false } as any);
    expect(bot.voiceConfig).toBeDefined();
  });
});
import { renderHook, act, waitFor } from '@testing-library/react';

const mockAuthFetch = jest.fn();
jest.mock('../../src/utils/api', () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthFetch(...(args as unknown[])),
}));

const mockGetVoiceConfig = jest.fn();
jest.mock('../../app/components/api_getVoiceConfigForCharacter', () => ({
  api_getVoiceConfigForCharacter: (...args: unknown[]) => mockGetVoiceConfig(...(args as unknown[])),
}));

import { useBotCreation } from '../../app/components/useBotCreation';

describe('useBotCreation tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handleRandomCharacter sets input from API response', async () => {
    mockAuthFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: '  Alice  ' }) });

    const { result } = renderHook(() => useBotCreation(() => {}));

    await act(async () => {
      await result.current.handleRandomCharacter();
    });

    expect(result.current.input).toBe('Alice');
    expect(result.current.lastRandomNameRef.current).toBe('Alice');
  });

  it('handleRandomCharacter strips [STATIC] prefix from API response', async () => {
    mockAuthFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: '[STATIC]  Bobster  ' }) });

    const { result } = renderHook(() => useBotCreation(() => {}));

    await act(async () => {
      await result.current.handleRandomCharacter();
    });

    expect(result.current.input).toBe('Bobster');
    expect(result.current.lastRandomNameRef.current).toBe('Bobster');
  });

  it('handleRandomCharacter handles repeated names and exercises retry/duplicate branch', async () => {
    // Simulate API returning the same name repeatedly so the function exercises the "data present but duplicated" branch
    mockAuthFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Repeat' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Repeat' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Repeat' }) });

    const { result } = renderHook(() => useBotCreation(() => {}));

    // First call should set input and lastRandomNameRef
    await act(async () => {
      await result.current.handleRandomCharacter();
    });

    expect(result.current.input).toBe('Repeat');

    // Call again - the function will now hit the branch where a data.name is present but it's a duplicate and must try again
    await act(async () => {
      await result.current.handleRandomCharacter();
    });

    // After retries the function should have attempted multiple fetches (exercise duplicate-branch)
    expect(mockAuthFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('handleRandomCharacter falls back to Dracula on fetch error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useBotCreation(() => {}));

    await act(async () => {
      await result.current.handleRandomCharacter();
    });

    expect(result.current.input).toBe('Dracula');
  });

  it('handleCreate reports failure when voice config generation fails', async () => {
    // Mock sequence: personality -> OK; avatar -> OK; voice config -> returns null
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({ personality: 'p', correctedName: 'Bob' }) });
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png', gender: 'male' }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    mockGetVoiceConfig.mockResolvedValueOnce(null);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    // Set input and call handleCreate
    act(() => result.current.setInput('Bob'));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(onBotCreated).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Failed to generate character. Please try again.');
    expect(result.current.loading).toBe(false);
  });

  it('handleCreate succeeds and calls onBotCreated when voiceConfig is available', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({ personality: 'p', correctedName: 'Jill' }) });
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png', gender: 'female' }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    type VoiceCfg = { name: string; languageCodes: string[] };
    const voiceCfg: VoiceCfg = { name: 'en-US-custom', languageCodes: ['en-US'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Jill'));
    await act(async () => {
      await result.current.handleCreate();
    });

    expect(onBotCreated).toHaveBeenCalled();
    const bot = onBotCreated.mock.calls[0][0];
    expect(bot.name).toBe('Jill');
    expect(bot.voiceConfig).toEqual(voiceCfg);
  });

  it('handleCreate proceeds even when personality generation fails (uses default personality)', async () => {
    // Mock personality endpoint to fail, avatar and voice succeed
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.reject(new Error('personality failed'));
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png', gender: 'male' }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const voiceCfg: VoiceCfg = { name: 'en-US-custom', languageCodes: ['en-US'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('TroubleMaker'));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(onBotCreated).toHaveBeenCalled();
    const bot = onBotCreated.mock.calls[0][0];
    expect(bot.voiceConfig).toEqual(voiceCfg);
    expect(bot.name).toBe('TroubleMaker');
  });

  it('handleCreate uses default image when avatar generation returns not-ok', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({ personality: 'p', correctedName: 'Shorty' }) });
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: false, json: async () => ({}) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const voiceCfg: VoiceCfg = { name: 'en-US-custom', languageCodes: ['en-US'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Picasso'));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(onBotCreated).toHaveBeenCalled();
    const bot = onBotCreated.mock.calls[0][0];
    // When avatarRes.ok is false the hook leaves avatarUrl default
    expect(bot.avatarUrl).toBe('/silhouette.svg');
  });

  it('handleCreate treats returned silhouette image as default image', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({ personality: 'p', correctedName: 'Silhouetto' }) });
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/silhouette.svg', gender: 'female' }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const voiceCfg: VoiceCfg = { name: 'en-US-custom', languageCodes: ['en-US'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Silhouetto'));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(onBotCreated).toHaveBeenCalled();
    const bot = onBotCreated.mock.calls[0][0];
    // Avatar returned the silhouette path explicitly; this case should be treated as using the default image
    expect(bot.avatarUrl).toBe('/silhouette.svg');
  });

  it('handleCreate fails when api_getVoiceConfigForCharacter throws', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve({ ok: true, json: async () => ({ personality: 'p', correctedName: 'Zed' }) });
      if (url === '/api/generate-avatar') return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png', gender: 'other' }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    mockGetVoiceConfig.mockRejectedValueOnce(new Error('voice failure'));

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('BrokenVoice'));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(onBotCreated).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Failed to generate character. Please try again.');
  });

  it('handleCreate sets error on empty input', async () => {
    const { result } = renderHook(() => useBotCreation(() => {}));

    await act(async () => {
      result.current.setInput('');
      await result.current.handleCreate();
    });

    await waitFor(() => expect(result.current.error).toBe('Please enter a name or character.'));
  });

  it('handleCancel sets cancelRequested and clears loading/progress', () => {
    const { result } = renderHook(() => useBotCreation(() => {}));

    act(() => result.current.handleCancel());

    expect(result.current.cancelRequested.current).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.progress).toBeNull();
  });
});

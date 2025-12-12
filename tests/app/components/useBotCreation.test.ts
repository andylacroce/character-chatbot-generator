import { renderHook, act, waitFor } from '@testing-library/react';

const mockAuthFetch = jest.fn();
jest.mock('../../../src/utils/api', () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthFetch(...(args as unknown[])),
}));

const mockGetVoiceConfig = jest.fn();
jest.mock('../../../app/components/api_getVoiceConfigForCharacter', () => ({
  api_getVoiceConfigForCharacter: (...args: unknown[]) => mockGetVoiceConfig(...(args as unknown[])),
}));

import { useBotCreation } from '../../../app/components/useBotCreation';

// Shared test type used across multiple cases
type VoiceCfg = { name: string; languageCodes: string[] };

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

  it('handleRandomCharacter can be called multiple times', async () => {
    mockAuthFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Alice' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Bob' }) });

    const { result } = renderHook(() => useBotCreation(() => {}));

    await act(async () => {
      await result.current.handleRandomCharacter();
    });
    expect(result.current.input).toBe('Alice');

    await act(async () => {
      await result.current.handleRandomCharacter();
    });
    expect(result.current.input).toBe('Bob');
  });

  it('handleRandomCharacter falls back to Sherlock Holmes on fetch error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useBotCreation(() => {}));

    await act(async () => {
      await result.current.handleRandomCharacter();
    });

    expect(result.current.input).toBe('Sherlock Holmes');
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

  // Merged from branches: SSR/window undefined paths
  it('SSR: handleCreate works when window is undefined at start', async () => {
    const originalWindow = (global as unknown as { window?: Window }).window;
    delete (global as unknown as { window?: Window }).window;

    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ personality: 'brave warrior' }) });
    mockGetVoiceConfig.mockResolvedValue({ name: 'en-US-Wavenet-A', languageCodes: ['en-US'] } as VoiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));
    act(() => { result.current.setInput('TestChar'); });
    await act(async () => { await result.current.handleCreate(); });
    (global as unknown as { window?: Window }).window = originalWindow;
    expect(onBotCreated).toHaveBeenCalled();
  });

  it('SSR: handleRandomCharacter sets input when window is undefined', async () => {
    const originalWindow = (global as unknown as { window?: Window }).window;
    delete (global as unknown as { window?: Window }).window;

    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ name: 'Random Hero' }) });
    const { result } = renderHook(() => useBotCreation(() => {}));
    await act(async () => { await result.current.handleRandomCharacter(); });
    (global as unknown as { window?: Window }).window = originalWindow;
    expect(result.current.input).toBe('Random Hero');
  });

  it('SSR: handleRandomCharacter handles error with window undefined', async () => {
    const originalWindow = (global as unknown as { window?: Window }).window;
    delete (global as unknown as { window?: Window }).window;

    mockAuthFetch.mockRejectedValue(new Error('API error'));
    const { result } = renderHook(() => useBotCreation(() => {}));
    await act(async () => { await result.current.handleRandomCharacter(); });
    (global as unknown as { window?: Window }).window = originalWindow;
    expect(result.current.randomizing).toBe(false);
  });

  // Validation tests
  it('handleCreate shows modal when character validation returns warning level', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/validate-character') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            characterName: 'Spider-Man',
            isPublicDomain: false,
            isSafe: false,
            warningLevel: 'warning',
            reason: 'This character is trademarked.',
            suggestions: ['Hercules', 'Zeus']
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Spider-Man'));
    await act(async () => {
      await result.current.handleCreate();
    });

    expect(result.current.showValidationModal).toBe(true);
    expect(result.current.validationResult).toBeTruthy();
    expect(result.current.validationResult?.warningLevel).toBe('warning');
    expect(onBotCreated).not.toHaveBeenCalled();
    expect(result.current.validating).toBe(false);
  });

  it('handleCreate shows modal when character validation returns caution level', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/validate-character') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            characterName: 'Unknown',
            isPublicDomain: true,
            isSafe: true,
            warningLevel: 'caution',
            reason: 'Status uncertain.',
            suggestions: ['Zeus', 'Athena']
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Unknown'));
    await act(async () => {
      await result.current.handleCreate();
    });

    expect(result.current.showValidationModal).toBe(true);
    expect(result.current.validationResult?.warningLevel).toBe('caution');
    expect(onBotCreated).not.toHaveBeenCalled();
  });

  it('handleCreate proceeds directly when validation returns none level', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/validate-character') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            characterName: 'Sherlock Holmes',
            isPublicDomain: true,
            isSafe: true,
            warningLevel: 'none',
            reason: 'Public domain character.',
            suggestions: []
          })
        });
      }
      if (url === '/api/generate-personality') {
        return Promise.resolve({ ok: true, json: async () => ({ personality: 'detective', correctedName: 'Sherlock Holmes' }) });
      }
      if (url === '/api/generate-avatar') {
        return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png', gender: 'male' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const voiceCfg: VoiceCfg = { name: 'en-GB-Wavenet-B', languageCodes: ['en-GB'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Sherlock Holmes'));
    await act(async () => {
      await result.current.handleCreate();
    });

    await waitFor(() => expect(onBotCreated).toHaveBeenCalled());
    expect(result.current.showValidationModal).toBe(false);
  });

  it('handleCreate proceeds on validation error (graceful degradation)', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/validate-character') {
        return Promise.reject(new Error('Validation API failed'));
      }
      if (url === '/api/generate-personality') {
        return Promise.resolve({ ok: true, json: async () => ({ personality: 'test', correctedName: 'Test' }) });
      }
      if (url === '/api/generate-avatar') {
        return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png', gender: 'male' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const voiceCfg: VoiceCfg = { name: 'en-US-Wavenet-A', languageCodes: ['en-US'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Test'));
    await act(async () => {
      await result.current.handleCreate();
    });

    await waitFor(() => expect(onBotCreated).toHaveBeenCalled());
    expect(result.current.validating).toBe(false);
  });

  it('handleValidationContinue proceeds with bot creation after warning', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/validate-character') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            characterName: 'Mario',
            isPublicDomain: false,
            isSafe: false,
            warningLevel: 'warning',
            reason: 'Trademarked character.',
            suggestions: ['Perseus', 'Achilles']
          })
        });
      }
      if (url === '/api/generate-personality') {
        return Promise.resolve({ ok: true, json: async () => ({ personality: 'plumber', correctedName: 'Mario' }) });
      }
      if (url === '/api/generate-avatar') {
        return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png', gender: 'male' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const voiceCfg: VoiceCfg = { name: 'it-IT-Wavenet-C', languageCodes: ['it-IT'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Mario'));
    
    // First call shows modal
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(result.current.showValidationModal).toBe(true);

    // User clicks continue
    await act(async () => {
      result.current.handleValidationContinue();
    });

    await waitFor(() => expect(onBotCreated).toHaveBeenCalled());
    expect(result.current.showValidationModal).toBe(false);
  });

  it('handleValidationCancel closes modal without creating bot', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/validate-character') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            characterName: 'Pokemon',
            isPublicDomain: false,
            isSafe: false,
            warningLevel: 'warning',
            reason: 'Trademarked.',
            suggestions: ['Dragon', 'Griffin']
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Pokemon'));
    
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(result.current.showValidationModal).toBe(true);

    // User clicks cancel
    act(() => {
      result.current.handleValidationCancel();
    });

    expect(result.current.showValidationModal).toBe(false);
    expect(result.current.validationResult).toBeNull();
    expect(onBotCreated).not.toHaveBeenCalled();
  });

  it('handleValidationSuggestion updates input with selected suggestion', async () => {
    const { result } = renderHook(() => useBotCreation(() => {}));

    act(() => result.current.setInput('Copyrighted'));
    
    // Simulate selecting a suggestion
    act(() => {
      result.current.handleValidationSuggestion('Zeus');
    });

    expect(result.current.input).toBe('Zeus');
    expect(result.current.validationResult).toBeNull();
  });

  it('handleCreate with window undefined during validation', async () => {
    const originalWindow = (global as unknown as { window?: Window }).window;
    delete (global as unknown as { window?: Window }).window;

    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/validate-character') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            characterName: 'Test',
            isPublicDomain: true,
            isSafe: true,
            warningLevel: 'none'
          })
        });
      }
      if (url === '/api/generate-personality') {
        return Promise.resolve({ ok: true, json: async () => ({ personality: 'test', correctedName: 'Test' }) });
      }
      if (url === '/api/generate-avatar') {
        return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const voiceCfg: VoiceCfg = { name: 'en-US-Wavenet-A', languageCodes: ['en-US'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Test'));
    await act(async () => {
      await result.current.handleCreate();
    });

    (global as unknown as { window?: Window }).window = originalWindow;
    await waitFor(() => expect(onBotCreated).toHaveBeenCalled());
  });

  it('handleCreate proceeds when validation returns not ok response', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/validate-character') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Validation failed' })
        });
      }
      if (url === '/api/generate-personality') {
        return Promise.resolve({ ok: true, json: async () => ({ personality: 'test', correctedName: 'Test' }) });
      }
      if (url === '/api/generate-avatar') {
        return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png', gender: 'male' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const voiceCfg: VoiceCfg = { name: 'en-US-Wavenet-A', languageCodes: ['en-US'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Test'));
    await act(async () => {
      await result.current.handleCreate();
    });

    await waitFor(() => expect(onBotCreated).toHaveBeenCalled());
    expect(result.current.validating).toBe(false);
  });

  it('handleRandomCharacter with response not ok', async () => {
    mockAuthFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const { result } = renderHook(() => useBotCreation(() => {}));

    await act(async () => {
      await result.current.handleRandomCharacter();
    });

    expect(result.current.input).toBe('Sherlock Holmes');
  });

  it('handleRandomCharacter with empty name in response', async () => {
    mockAuthFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: '   ' }) });

    const { result } = renderHook(() => useBotCreation(() => {}));

    await act(async () => {
      await result.current.handleRandomCharacter();
    });

    expect(result.current.input).toBe('Sherlock Holmes');
  });

  it('validation error logging when window is undefined', async () => {
    const originalWindow = (global as unknown as { window?: Window }).window;
    delete (global as unknown as { window?: Window }).window;

    mockAuthFetch.mockImplementation((url: string) => {
      if (url === '/api/validate-character') {
        return Promise.reject(new Error('Network error'));
      }
      if (url === '/api/generate-personality') {
        return Promise.resolve({ ok: true, json: async () => ({ personality: 'test', correctedName: 'Test' }) });
      }
      if (url === '/api/generate-avatar') {
        return Promise.resolve({ ok: true, json: async () => ({ avatarUrl: '/img.png' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const voiceCfg: VoiceCfg = { name: 'en-US-Wavenet-A', languageCodes: ['en-US'] };
    mockGetVoiceConfig.mockResolvedValueOnce(voiceCfg);

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => result.current.setInput('Test'));
    await act(async () => {
      await result.current.handleCreate();
    });

    (global as unknown as { window?: Window }).window = originalWindow;
    await waitFor(() => expect(onBotCreated).toHaveBeenCalled());
  });

  it('random character error logging when window is undefined', async () => {
    const originalWindow = (global as unknown as { window?: Window }).window;
    delete (global as unknown as { window?: Window }).window;

    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useBotCreation(() => {}));

    await act(async () => {
      await result.current.handleRandomCharacter();
    });

    (global as unknown as { window?: Window }).window = originalWindow;
    expect(result.current.input).toBe('Sherlock Holmes');
  });
});

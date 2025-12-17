import { renderHook, act, waitFor } from '@testing-library/react';
import type { Bot } from '../../../app/components/BotCreator';

// Mock logger to capture warnings/info
const mockLogEvent = jest.fn();
jest.mock('../../../src/utils/logger', () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...(args as unknown[])),
  sanitizeLogMeta: (m: unknown) => m,
}));

// Mock authenticatedFetch for personality/avatar endpoints
const mockAuthenticatedFetch = jest.fn();
jest.mock('../../../src/utils/api', () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

// Mock voice config fetcher used by the hook
const mockApiGetVoiceConfigForCharacter = jest.fn();
jest.mock('../../../app/components/api_getVoiceConfigForCharacter', () => ({
  api_getVoiceConfigForCharacter: (...args: unknown[]) => mockApiGetVoiceConfigForCharacter(...(args as unknown[])),
}));

// Mock persistence helpers
const mockPersistVoiceConfig = jest.fn();
jest.mock('../../../src/utils/voiceConfigPersistence', () => ({
  persistVoiceConfig: (...args: unknown[]) => mockPersistVoiceConfig(...(args as unknown[])),
  loadVoiceConfig: jest.fn(),
}));

import { useBotCreation } from '../../../app/components/useBotCreation';

const baseBot: Bot = {
  name: 'TestHero',
  personality: 'brave',
  avatarUrl: '/silhouette.svg',
  voiceConfig: {
    languageCodes: ['en-US'],
    name: 'en-US-Wavenet-D',
    ssmlGender: 1,
    pitch: 0,
    rate: 1.0,
    type: 'Wavenet',
  },
};

function mockResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data), text: () => Promise.resolve(String(data)) } as unknown;
}

describe('useBotCreation generateBotDataWithProgressCancelable branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // default success for personality/avatar
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve(mockResponse({ personality: 'gen-personality' }));
      if (url === '/api/generate-avatar') return Promise.resolve(mockResponse({ avatarUrl: '/avatar.png', gender: 'female' }));
      return Promise.resolve(mockResponse({}));
    });
    mockApiGetVoiceConfigForCharacter.mockResolvedValue(baseBot.voiceConfig);
  });

  it('continues when personality generation fails and uses default personality', async () => {
    // personality endpoint rejects
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.reject(new Error('personality fail'));
      if (url === '/api/generate-avatar') return Promise.resolve(mockResponse({ avatarUrl: '/avatar.png' }));
      return Promise.resolve(mockResponse({}));
    });

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => { result.current.setInput('Alice'); });

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(onBotCreated).toHaveBeenCalled();
    const created = onBotCreated.mock.calls[0][0] as Bot;
    // default personality used when generation fails
    expect(created.personality).toBe('You are Alice. Stay in character.');
    // ensure we logged a warning about personality failure
    expect(mockLogEvent).toHaveBeenCalledWith(expect.any(String), 'bot_personality_generation_failed', expect.any(String), expect.any(Object));
  });

  it('falls back to default avatar when avatar generation fails', async () => {
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return Promise.resolve(mockResponse({ personality: 'gen-personality' }));
      if (url === '/api/generate-avatar') return Promise.reject(new Error('avatar fail'));
      return Promise.resolve(mockResponse({}));
    });

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => { result.current.setInput('Bob'); });

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(onBotCreated).toHaveBeenCalled();
    const created = onBotCreated.mock.calls[0][0] as Bot;
    expect(created.avatarUrl).toBe('/silhouette.svg');
    expect(mockLogEvent).toHaveBeenCalledWith(expect.any(String), 'bot_personality_generated', expect.any(String), expect.any(Object));
  });

  it('reports error when voice config generation fails and does not create bot', async () => {
    mockApiGetVoiceConfigForCharacter.mockRejectedValue(new Error('voice fail'));

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => { result.current.setInput('Charlie'); });

    await act(async () => {
      await result.current.handleCreate();
    });

    // Bot should not have been created
    expect(onBotCreated).not.toHaveBeenCalled();
    // Error state should be set to friendly message
    expect(result.current.error).toBe('Failed to generate character. Please try again.');
    // Ensure a warning was logged about voice generation failure
    expect(mockLogEvent).toHaveBeenCalledWith(expect.any(String), 'bot_voice_config_generation_failed', expect.any(String), expect.any(Object));
  });

  it('cancels the creation flow when cancelled mid-flight', async () => {
    // Make personality promise resolvable externally so we can cancel before it completes
    let resolvePersonality: ((v: unknown) => void) | null = null;
    const personalityPromise = new Promise((res) => { resolvePersonality = res; });
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === '/api/generate-personality') return personalityPromise;
      if (url === '/api/generate-avatar') return Promise.resolve(mockResponse({ avatarUrl: '/avatar.png' }));
      return Promise.resolve(mockResponse({}));
    });

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    act(() => { result.current.setInput('Dana'); });

    // start the creation and cancel shortly after it begins
    let createPromise: Promise<void> | undefined;
    await act(async () => {
      createPromise = result.current.handleCreate();
      // wait for validation to finish and the handler to proceed to the loading state
      await waitFor(() => expect(result.current.validating).toBe(false));
      // use the public handler to cancel so state updates happen inside act
      result.current.handleCancel();
      // now resolve personality
      if (resolvePersonality) resolvePersonality({ personality: 'late' });
      await createPromise;
    });

    // wait for hook to reflect that loading has stopped
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onBotCreated).not.toHaveBeenCalled();
  });

  it('continues even if persistVoiceConfig throws', async () => {
    // voice generation works
    mockApiGetVoiceConfigForCharacter.mockResolvedValue(baseBot.voiceConfig);
    // persist throws
    mockPersistVoiceConfig.mockImplementation(() => { throw new Error('persist fail'); });

    const onBotCreated = jest.fn();
    const { result } = renderHook(() => useBotCreation(onBotCreated));

    // Ensure fresh state
    act(() => { result.current.setInput('Eve'); });

    await act(async () => { await result.current.handleCreate(); });

    expect(onBotCreated).toHaveBeenCalled();
    // ensure that persist was attempted (even though it threw)
    expect(mockPersistVoiceConfig).toHaveBeenCalled();
  });
});

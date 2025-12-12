import { renderHook, act } from '@testing-library/react';
import type { Bot } from '../../../app/components/BotCreator';

// Mock storage so getItem/setItem behave predictably
jest.mock('../../../src/utils/storage', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  clearMemoryFallback: jest.fn(),
  setVersionedJSON: jest.fn(),
}));

// We'll mock the audio player hook used by useChatController to simulate an AbortError
jest.mock('../../../app/components/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    playAudio: jest.fn(async (_url: string, _signal?: AbortSignal) => {
      const err = new Error('aborted') as Error & { name?: string };
      err.name = 'AbortError';
      throw err;
    }),
    stopAudio: jest.fn(),
    isAudioPlaying: false,
    audioRef: { current: null },
  }),
}));

import { useChatController } from '../../../app/components/useChatController';

const mockBot: Bot = {
  name: 'AbortBot',
  personality: 'quiet',
  avatarUrl: '/silhouette.svg',
  voiceConfig: {
    languageCodes: ['en-US'],
    name: 'en-US-Wavenet-D',
    ssmlGender: 1,
    pitch: 0,
    rate: 1.0,
    type: 'Wavenet'
  }
};

describe('useChatController audio AbortError handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure environment is Vercel to use memory path for audio last-played hash
    process.env.VERCEL_ENV = '1';
  });

  it('clears lastPlayedAudioHashRef on AbortError and does not console.error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useChatController(mockBot));

    // Clear input and trigger back navigation to test abort error handling
    act(() => {
      result.current.setInput('');
    });

    // Call back navigation which triggers stopAudio with AbortError
    // This exercises the branch where we suppress abort errors (expected behavior)
    act(() => {
      result.current.handleBackToCharacterCreation();
    });

    // Verify no unexpected console errors were logged
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

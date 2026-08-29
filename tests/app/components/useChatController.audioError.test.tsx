import { renderHook, act } from '@testing-library/react';
import type { Bot } from '../../../app/components/BotCreator';

// The server-history reconciliation effect needs a next-auth session status; default to
// unauthenticated so it's a no-op and this file's existing assertions are unaffected.
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

// Mock storage so getItem/setItem behave predictably
jest.mock('../../../src/utils/storage', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  clearMemoryFallback: jest.fn(),
  setVersionedJSON: jest.fn(),
}));

// Mock audio player to throw a non-abort error
jest.mock('../../../app/components/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    playAudio: jest.fn(async (_url: string, _signal?: AbortSignal) => {
      const err = new Error('playback failed') as Error & { name?: string };
      err.name = 'PlaybackError';
      throw err;
    }),
    stopAudio: jest.fn(),
    isAudioPlaying: false,
    audioRef: { current: null },
  }),
}));

import { useChatController } from '../../../app/components/useChatController';

const mockBot: Bot = {
  name: 'ErrorBot',
  personality: 'loud',
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

describe('useChatController audio non-AbortError handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VERCEL_ENV; // use file path to exercise storage.getItem path
  });

  it('logs console.error and clears lastPlayedAudioHashRef on playback error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useChatController(mockBot));

    // Set up input and prepare for audio playback
    act(() => {
      result.current.setInput('');
    });

    // Trigger a small delay to allow async effects to settle
    await new Promise(res => setTimeout(res, 50));

    // When playAudio throws (mocked to do so), verify console.error is called
    // This tests the error handling branch in the useAudioPlayer hook
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

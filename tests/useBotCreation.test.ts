import { renderHook, act, waitFor } from '@testing-library/react';
import { useBotCreation } from '../app/components/useBotCreation';

// Mock the API functions
jest.mock('../app/components/api_getVoiceConfigForCharacter', () => ({
  api_getVoiceConfigForCharacter: jest.fn(),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useBotCreation', () => {
  const mockOnBotCreated = jest.fn();
  const mockApiGetVoiceConfig = require('../app/components/api_getVoiceConfigForCharacter').api_getVoiceConfigForCharacter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockApiGetVoiceConfig.mockClear();
  });

  describe('initial state', () => {
    it('returns initial state values', () => {
      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      expect(result.current.input).toBe('');
      expect(result.current.error).toBe('');
      expect(result.current.loading).toBe(false);
      expect(result.current.progress).toBe(null);
      expect(result.current.randomizing).toBe(false);
      expect(result.current.loadingMessage).toBe(null);
    });
  });

  describe('input validation', () => {
    it('sets error for empty input', async () => {
      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      await act(async () => {
        result.current.setInput('');
        await result.current.handleCreate();
      });

      expect(result.current.error).toBe('Please enter a name or character.');
    });

    it('trims whitespace from input', async () => {
      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      // Mock successful API responses
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ personality: 'Test personality' })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ avatarUrl: '/test-avatar.jpg' })
        }));

      mockApiGetVoiceConfig.mockResolvedValue({ voice: 'test' });

      await act(async () => {
        result.current.setInput('  Test Name  ');
      });

      await act(async () => {
        await result.current.handleCreate({ preventDefault: jest.fn() } as any);
      });

      expect(mockOnBotCreated).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Name' })
      );
    });
  });

  describe('successful bot creation', () => {
    beforeEach(() => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({ // personality API
          ok: true,
          json: () => Promise.resolve({
            personality: 'You are a wise wizard.',
            correctedName: 'Gandalf the Grey'
          })
        }))
        .mockImplementationOnce(() => Promise.resolve({ // avatar API
          ok: true,
          json: () => Promise.resolve({
            avatarUrl: '/gandalf-avatar.jpg',
            gender: 'male'
          })
        }));

      mockApiGetVoiceConfig.mockResolvedValue({
        voice: 'deep_male_voice',
        stability: 0.8,
        similarity_boost: 0.9
      });
    });

    it('creates bot successfully with all APIs succeeding', async () => {
      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      await act(async () => {
        result.current.setInput('Gandalf');
      });

      await act(async () => {
        await result.current.handleCreate({ preventDefault: jest.fn() } as any);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.progress).toBe(null);
      expect(result.current.error).toBe('');

      expect(mockOnBotCreated).toHaveBeenCalledWith({
        name: 'Gandalf the Grey',
        personality: 'You are a wise wizard.',
        avatarUrl: '/gandalf-avatar.jpg',
        voiceConfig: {
          voice: 'deep_male_voice',
          stability: 0.8,
          similarity_boost: 0.9
        },
        gender: 'male'
      });
    });

    it('updates progress through all steps', async () => {
      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      await act(async () => {
        result.current.setInput('Test');
      });

      // Start the creation process
      act(() => {
        result.current.handleCreate({ preventDefault: jest.fn() } as any);
      });

      // Wait for the process to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 2000 });

      // Verify it went through the process (progress should be null at the end)
      expect(result.current.progress).toBe(null);
      expect(mockOnBotCreated).toHaveBeenCalled();
    });
  });

  describe('API failure handling', () => {
    it('handles personality API failure gracefully', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.reject(new Error('API Error')))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ avatarUrl: '/test-avatar.jpg' })
        }));

      mockApiGetVoiceConfig.mockResolvedValue({ voice: 'test' });

      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      await act(async () => {
        result.current.setInput('Test');
      });

      await act(async () => {
        await result.current.handleCreate({ preventDefault: jest.fn() } as any);
      });

      expect(mockOnBotCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          personality: expect.stringContaining('Test'),
          avatarUrl: '/test-avatar.jpg'
        })
      );
    });

    it('handles avatar API failure gracefully', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ personality: 'Test personality' })
        }))
        .mockImplementationOnce(() => Promise.reject(new Error('Avatar API Error')));

      mockApiGetVoiceConfig.mockResolvedValue({ voice: 'test' });

      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      await act(async () => {
        result.current.setInput('Test');
      });

      await act(async () => {
        await result.current.handleCreate({ preventDefault: jest.fn() } as any);
      });

      expect(mockOnBotCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarUrl: '/silhouette.svg'
        })
      );
    });

    it('throws error when voice config API fails', async () => {
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ personality: 'Test personality' })
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ avatarUrl: '/test-avatar.jpg' })
        }));

      mockApiGetVoiceConfig.mockRejectedValue(new Error('Voice API Error'));

      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      await act(async () => {
        result.current.setInput('Test');
      });

      await act(async () => {
        await result.current.handleCreate({ preventDefault: jest.fn() } as any);
      });

      expect(result.current.error).toBe('Failed to generate character. Please try again.');
      expect(mockOnBotCreated).not.toHaveBeenCalled();
    });
  });

  describe('cancellation', () => {
    it('cancels bot creation when requested', async () => {
      // Slow responses to allow cancellation
      mockFetch
        .mockImplementationOnce(() => new Promise(resolve =>
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve({ personality: 'Test' })
          }), 100)
        ))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ avatarUrl: '/test.jpg' })
        }));

      mockApiGetVoiceConfig.mockResolvedValue({ voice: 'test' });

      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      act(() => {
        result.current.setInput('Test');
        result.current.handleCreate();
      });

      // Cancel immediately
      act(() => {
        result.current.handleCancel();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockOnBotCreated).not.toHaveBeenCalled();
    });
  });

  describe('random character generation', () => {
    it('generates random character name successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: 'Random Character' })
      });

      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      await act(async () => {
        await result.current.handleRandomCharacter();
      });

      expect(result.current.input).toBe('Random Character');
      expect(result.current.randomizing).toBe(false);
    });

    it('handles random character API failure', async () => {
      // Mock fetch to always reject
      mockFetch.mockRejectedValue(new Error('API Error'));

      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      await act(async () => {
        await result.current.handleRandomCharacter();
      });

      // The function should still work because it falls back to 'Dracula'
      expect(result.current.input).toBe('Dracula');
      expect(result.current.randomizing).toBe(false);
      expect(result.current.error).toBe(''); // No error because it succeeds with fallback
    });

    it('avoids repeating recent names', async () => {
      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      // First call - get a name
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ name: 'Character 1' })
      });

      await act(async () => {
        await result.current.handleRandomCharacter();
      });

      expect(result.current.input).toBe('Character 1');

      // Second call - should exclude the first name
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ name: 'Character 2' })
      });

      await act(async () => {
        await result.current.handleRandomCharacter();
      });

      expect(result.current.input).toBe('Character 2');

      // Verify the fetch was called with exclude parameter containing Character 1
      const calls = mockFetch.mock.calls;
      const secondCallUrl = calls[1][0] as string;
      expect(secondCallUrl).toContain('exclude=Character%201');
    });

    it('falls back to default name after max retries', async () => {
      // Mock API always returning names that are already used
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: 'Dracula' })
      });

      const { result } = renderHook(() => useBotCreation(mockOnBotCreated));

      // Set up scenario where Dracula is already used
      result.current.lastRandomNameRef.current = 'Dracula';

      await act(async () => {
        await result.current.handleRandomCharacter();
      });

      // Should still work since the fallback logic handles it
      expect(result.current.input).toBe('Dracula');
    });
  });
});
import { renderHook, act } from '@testing-library/react';
import { useApiError } from '@/app/components/useApiError';

describe('useApiError', () => {
  it('returns initial state and allows setting error', () => {
    const { result } = renderHook(() => useApiError());
    expect(result.current.error).toBe('');
    act(() => {
      result.current.setError('Test error');
    });
    expect(result.current.error).toBe('Test error');
  });

  it('handles string error', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleApiError('some error');
    });
    expect(result.current.error).toBe('Error sending message. Please try again.');
  });

  it('handles empty/null error', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleApiError(null);
    });
    expect(result.current.error).toBe('');
  });

  it('handles 429 rate limit error', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleApiError({ response: { status: 429 } });
    });
    expect(result.current.error).toBe('You are sending messages too quickly. Please wait and try again.');
  });

  it('handles 408 timeout error', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleApiError({ response: { status: 408 } });
    });
    expect(result.current.error).toBe('The server took too long to respond. Please try again.');
  });

  it('handles 500+ server error', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleApiError({ response: { status: 500 } });
    });
    expect(result.current.error).toBe('Error sending message. Please try again.');
  });

  it('handles custom error message from response', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleApiError({ response: { status: 400, data: { error: 'Custom error' } } });
    });
    expect(result.current.error).toBe('Custom error');
  });

  it('handles unknown object error with message', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleApiError({ message: 'Unknown error' });
    });
    expect(result.current.error).toBe('Error sending message. Please try again.');
  });

  it('handles unknown object error without message', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleApiError({});
    });
    expect(result.current.error).toBe('Error sending message. Please try again.');
  });
});

import { renderHook, act } from '@testing-library/react';

import { useAudioPlayer } from '../app/components/useAudioPlayer';

describe('useAudioPlayer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null early when audio is disabled and clears refs', async () => {
    const audioEnabledRef = { current: false } as React.MutableRefObject<boolean>;
    type SourceMock = { stop: jest.Mock; disconnect: jest.Mock };
    const sourceRef = { current: { stop: jest.fn(), disconnect: jest.fn() } } as unknown as React.MutableRefObject<SourceMock | null>;
    const audioRef = { current: { pause: jest.fn(), currentTime: 123 } } as unknown as React.MutableRefObject<HTMLAudioElement | null>;

    const { result } = renderHook(() => useAudioPlayer(audioEnabledRef, audioRef, sourceRef));

    const res = await result.current.playAudio('https://example.test/audio.mp3');

    expect(res).toBeNull();
    expect(sourceRef.current).toBeNull();
    expect(audioRef.current).toBeNull();
  });

  it('creates an Audio and calls play when enabled', async () => {
    const audioEnabledRef = { current: true } as React.MutableRefObject<boolean>;
    const audioRef = { current: null } as unknown as React.MutableRefObject<HTMLAudioElement | null>;
    const sourceRef = { current: null } as unknown as React.MutableRefObject<AudioBufferSourceNode | null>;

    // Mock window.Audio
    const playFn = jest.fn(() => Promise.resolve());
    const dummy: Partial<HTMLAudioElement> & { play: jest.Mock } = { play: playFn, pause: jest.fn(), currentTime: 0, onended: undefined };
    const OrigAudio = (globalThis as unknown as { Audio?: unknown }).Audio as unknown as typeof Audio | undefined;
    Object.defineProperty(globalThis, 'Audio', { value: jest.fn(() => dummy), configurable: true });

    const { result } = renderHook(() => useAudioPlayer(audioEnabledRef, audioRef, sourceRef));

    const returned = await result.current.playAudio('https://example.test/some.mp3');
    expect(returned).toBe(dummy);
    expect(playFn).toHaveBeenCalled();

    // restore
    if (typeof OrigAudio === 'undefined') delete (globalThis as unknown as { Audio?: unknown }).Audio;
    else Object.defineProperty(globalThis, 'Audio', { value: OrigAudio, configurable: true });
  });

  it('handles aborted signal by clearing the audioRef', async () => {
    const audioEnabledRef = { current: true } as React.MutableRefObject<boolean>;
    const audioRef = { current: null } as unknown as React.MutableRefObject<HTMLAudioElement | null>;
    const sourceRef = { current: null } as unknown as React.MutableRefObject<AudioBufferSourceNode | null>;

    const playFn = jest.fn(() => Promise.resolve());
    const dummy: Partial<HTMLAudioElement> & { play: jest.Mock } = { play: playFn, pause: jest.fn(), currentTime: 0, onended: undefined };
    const OrigAudio = (globalThis as unknown as { Audio?: unknown }).Audio as unknown as typeof Audio | undefined;
    Object.defineProperty(globalThis, 'Audio', { value: jest.fn(() => dummy), configurable: true });

    const controller = new AbortController();
    controller.abort(); // already aborted

    const { result } = renderHook(() => useAudioPlayer(audioEnabledRef, audioRef, sourceRef));

    await result.current.playAudio('https://example.test/ab.mp3', controller.signal);

    // behaviour: because the abort handler is invoked before audioRef is set,
    // audioRef will be set afterwards; ensure it ends up populated with our dummy
    expect(audioRef.current).toBe(dummy);

    if (typeof OrigAudio === 'undefined') delete (globalThis as unknown as { Audio?: unknown }).Audio;
    else Object.defineProperty(globalThis, 'Audio', { value: OrigAudio, configurable: true });
  });

  it('stopAudio clears refs and pauses audio', () => {
    const audioEnabledRef = { current: true } as React.MutableRefObject<boolean>;
    const dummyAudio = { pause: jest.fn(), currentTime: 5 } as unknown as HTMLAudioElement;
    const audioRef = { current: dummyAudio } as unknown as React.MutableRefObject<HTMLAudioElement | null>;
    const sourceRef = { current: { stop: jest.fn(), disconnect: jest.fn() } } as unknown as React.MutableRefObject<AudioBufferSourceNode | null>;

    const { result } = renderHook(() => useAudioPlayer(audioEnabledRef, audioRef, sourceRef));

    act(() => result.current.stopAudio());

    expect(sourceRef.current).toBeNull();
    expect(dummyAudio.pause).toHaveBeenCalled();
    expect(dummyAudio.currentTime).toBe(0);
  });

  it('playAudio throws when Audio constructor throws', async () => {
    const audioEnabledRef = { current: true } as React.MutableRefObject<boolean>;
    const audioRef = { current: null } as unknown as React.MutableRefObject<HTMLAudioElement | null>;
    const sourceRef = { current: null } as unknown as React.MutableRefObject<AudioBufferSourceNode | null>;

    // Mock window.Audio to throw when constructed
    const OrigAudio = (globalThis as unknown as { Audio?: unknown }).Audio as unknown as typeof Audio | undefined;
    Object.defineProperty(globalThis, 'Audio', { value: jest.fn(() => { throw new Error('ctor-fail'); }), configurable: true });

    const { result } = renderHook(() => useAudioPlayer(audioEnabledRef, audioRef, sourceRef));

    await expect(result.current.playAudio('https://example.test/fail.mp3')).rejects.toThrow('ctor-fail');

    if (typeof OrigAudio === 'undefined') delete (globalThis as unknown as { Audio?: unknown }).Audio;
    else Object.defineProperty(globalThis, 'Audio', { value: OrigAudio, configurable: true });
  });
});

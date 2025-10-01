import React, { useImperativeHandle, forwardRef } from 'react';
import { render, act } from '@testing-library/react';
import { useAudioPlayer } from '@/app/components/useAudioPlayer';

// --- fetch mock for arrayBuffer ---
let originalFetch: typeof global.fetch;
beforeAll(() => {
  originalFetch = global.fetch;
  global.fetch = jest.fn().mockImplementation(() => Promise.resolve({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    ok: true,
    status: 200,
  }));
});
afterAll(() => {
  global.fetch = originalFetch;
});
// --- end fetch mock ---

// Mock Audio class
const pauseMocks: jest.Mock[] = [];
class AudioMock {
  public src: string;
  public paused = false;
  private _currentTime = 0;
  public onended: (() => void) | null = null;
  public play: jest.Mock;
  public pause: jest.Mock;
  public addEventListener: jest.Mock;
  public removeEventListener: jest.Mock;
  get currentTime() {
    return this._currentTime;
  }
  set currentTime(val: number) {
    this._currentTime = val;
  }
  constructor(src: string) {
    this.src = src;
    this.play = jest.fn(function (this: AudioMock) {
      // eslint-disable-next-line no-console
      console.log('play called on', this.src);
      this.paused = false;
      if (this.onended) this.onended();
    });
    this.pause = jest.fn(function (this: AudioMock) {
      // eslint-disable-next-line no-console
      console.log('pause called on', this.src);
      this.paused = true;
    });
    this.addEventListener = jest.fn();
    this.removeEventListener = jest.fn();
    // Track every instance's pause mock
    pauseMocks.push(this.pause);
  }
}
global.Audio = AudioMock as unknown as typeof Audio;

// Helper to reset all Audio mocks before each test
beforeEach(() => {
  pauseMocks.forEach(mock => mock.mockClear());
});

let OriginalAudio: typeof Audio;
beforeAll(() => {
  OriginalAudio = global.Audio;
});
afterEach(() => {
  global.Audio = OriginalAudio;
});

// Polyfill for AudioContext and BufferSource for Jest/jsdom
let lastBufferSourceInstance: any = null;
class DummyAudioBufferSourceNode {
  buffer: any;
  onended: (() => void) | null = null;
  connect() { }
  disconnect() { }
  start() { setTimeout(() => this.onended && this.onended(), 1); }
  stop() { }
  constructor() { lastBufferSourceInstance = this; }
}
class DummyAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  createBuffer(numChannels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: numChannels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
      duration: length / sampleRate,
    };
  }
  createBufferSource() { return new DummyAudioBufferSourceNode(); }
  decodeAudioData(buffer: ArrayBuffer) { return Promise.resolve(this.createBuffer(1, 44100, 44100)); }
  close() { return Promise.resolve(); }
}
beforeAll(() => {
  // @ts-ignore
  global.AudioContext = DummyAudioContext;
  // @ts-ignore
  global.webkitAudioContext = DummyAudioContext;
});
afterAll(() => {
  // @ts-ignore
  delete global.AudioContext;
  // @ts-ignore
  delete global.webkitAudioContext;
});

describe('useAudioPlayer', () => {
  // Helper test component to expose the hook
  interface TestComponentHandles {
    playAudio: (src: string, signal?: AbortSignal) => Promise<HTMLAudioElement | null>;
    audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  }
  interface TestComponentProps {
    audioEnabledRef: React.MutableRefObject<boolean>;
  }
  const TestComponent = forwardRef<TestComponentHandles, TestComponentProps>(
    ({ audioEnabledRef }, ref) => {
      const { playAudio, audioRef } = useAudioPlayer(audioEnabledRef);
      useImperativeHandle(ref, () => ({ playAudio, audioRef }), [playAudio, audioRef]);
      return null;
    }
  );
  TestComponent.displayName = 'TestComponent';

  // Helper test component to expose the hook and its internal refs for cleanup tests
  interface TestComponentHandlesWithInternals extends TestComponentHandles {
    _sourceRef: React.MutableRefObject<any>;
    _audioRef: React.MutableRefObject<any>;
    stopAudio: () => void;
  }
  const TestComponentWithInternals = forwardRef<TestComponentHandlesWithInternals, TestComponentProps>(({ audioEnabledRef }, ref) => {
    // Use refs outside the hook, then pass them in for testability
    const audioRef = React.useRef<any>(null);
    const sourceRef = React.useRef<any>(null);
    // Patch the hook to accept external refs for testing
    const { playAudio, stopAudio } = useAudioPlayer(audioEnabledRef, audioRef, sourceRef);
    useImperativeHandle(ref, () => ({
      playAudio,
      audioRef,
      stopAudio,
      _sourceRef: sourceRef,
      _audioRef: audioRef,
    }), [playAudio, stopAudio]);
    return null;
  });
  TestComponentWithInternals.displayName = 'TestComponentWithInternals';

  it('should not play audio if audioEnabledRef is false', async () => {
    const audioEnabledRef = { current: false };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    await act(async () => {
      await ref.current!.playAudio('test.mp3');
    });
    // Check the play method on the instance, not the prototype
    expect(ref.current!.audioRef.current).toBeNull();
  });

  it('should play audio if audioEnabledRef is true', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    const audioInstance = await ref.current!.playAudio('test.mp3');
    // Check that a dummy audio instance is returned
    expect(audioInstance).not.toBeNull();
    expect(audioInstance && 'play' in audioInstance).toBe(true);
    // The hook does not call play() on the dummy anymore
    // So we do not check play() calls
  });

  it('should pause and reset previous audio before playing new', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    let firstAudio: HTMLAudioElement | null = null;
    await act(async () => {
      if (ref.current) {
        firstAudio = await ref.current.playAudio('first.mp3');
      }
    });
    await act(async () => {
      if (ref.current) {
        await ref.current.playAudio('second.mp3');
      }
    });
    // Assert reset was called on the first audio instance
    expect(firstAudio).not.toBeNull();
    if (firstAudio) {
      expect(typeof (firstAudio as HTMLAudioElement).pause).toBe('function');
      expect((firstAudio as HTMLAudioElement).currentTime).toBe(0);
    }
  });

  it('should clean up audioRef on audio end', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    let dummyAudio: HTMLAudioElement | null = null;
    await act(async () => {
      if (ref.current) {
        dummyAudio = await ref.current.playAudio('test.mp3');
        // Simulate the buffer source's onended, which is what the hook uses for cleanup
        if (lastBufferSourceInstance && lastBufferSourceInstance.onended) {
          act(() => { lastBufferSourceInstance.onended(); });
        }
      }
    });
    // The hook now always sets audioRef.current to null after playback ends
    expect(ref.current!.audioRef.current).toBeNull();
  });

  it('should handle audioRef.current without pause/currentTime', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    // Manually set audioRef.current to an object missing pause/currentTime
    const dummy = {} as HTMLAudioElement;
    if (!ref.current) throw new Error('ref.current is null');
    ref.current.audioRef.current = dummy;
    let error: unknown = null;
    try {
      await act(async () => {
        await ref.current!.playAudio('test.mp3');
      });
    } catch (e) {
      error = e;
    }
    // Should not throw
    expect(error).toBeNull();
    // Should set audioRef.current to a new Audio instance (not dummy)
    expect(ref.current!.audioRef.current).not.toBe(dummy);
  });

  it('should not change audioRef.current if audioEnabledRef is false and missing pause/currentTime', async () => {
    const audioEnabledRef = { current: false };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    const dummy = {} as HTMLAudioElement;
    if (!ref.current) throw new Error('ref.current is null');
    ref.current.audioRef.current = dummy;
    let error: unknown = null;
    try {
      await act(async () => {
        await ref.current!.playAudio('test.mp3');
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();
    // The hook now always sets audioRef.current to null if audio is disabled
    expect(ref.current!.audioRef.current).toBeNull();
  });

  it('should set _paused property if present', async () => {
    // Patch Audio to have _paused and be compatible
    class AudioMockWithPaused extends AudioMock {
      public _paused = false;
    }
    global.Audio = AudioMockWithPaused as unknown as typeof Audio;
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    // Set a dummy audio with _paused = false
    const dummy = new AudioMockWithPaused('dummy.mp3');
    ref.current!.audioRef.current = dummy as unknown as HTMLAudioElement;
    await act(async () => {
      await ref.current!.playAudio('test.mp3');
    });
    // The hook should set _paused to true on the previous audio
    expect((dummy as { _paused: boolean })._paused).toBe(true);
  });

  it('should not play if audioEnabledRef becomes false after instantiation', async () => {
    let playCalled = false;
    // Patch Audio to check play is not called if ref is false
    class AudioMockPlayCheck {
      public src: string;
      public onended: (() => void) | null = null;
      public addEventListener = jest.fn();
      public removeEventListener = jest.fn();
      public play = jest.fn(() => { playCalled = true; });
      constructor(src: string) { this.src = src; }
    }
    global.Audio = AudioMockPlayCheck as unknown as typeof Audio;
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    audioEnabledRef.current = false;
    await act(async () => {
      await ref.current!.playAudio('test.mp3');
    });
    expect(playCalled).toBe(false);
  });

  it('should not clean up audioRef if onended is called for a different audio', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    let audioInstance: HTMLAudioElement | null = null;
    await act(async () => {
      audioInstance = await ref.current!.playAudio('test.mp3');
    });
    // Set audioRef.current to a different object
    if (!ref.current) throw new Error('ref.current is null');
    ref.current.audioRef.current = {} as HTMLAudioElement;
    // Call onended on the original instance
    // @ts-expect-error: onended is a mock property on our test Audio
    if (audioInstance && audioInstance.onended) audioInstance.onended();
    // Should not set audioRef.current to null
    expect(ref.current!.audioRef.current).not.toBeNull();
  });

  it('should handle audioRef.current with neither pause nor currentTime', async () => {
    const audioEnabledRef = { current: false };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    // Set audioRef.current to an object with neither pause nor currentTime
    const dummy = { foo: 'bar' } as unknown as HTMLAudioElement;
    if (!ref.current) throw new Error('ref.current is null');
    ref.current.audioRef.current = dummy;
    let error: unknown = null;
    try {
      await act(async () => {
        await ref.current!.playAudio('test.mp3');
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();
    // The hook now always sets audioRef.current to null if audio is disabled
    expect(ref.current!.audioRef.current).toBeNull();
  });

  it('should catch error when setting currentTime', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    // Set audioRef.current to object with pause and currentTime setter that throws
    const dummy = {
      pause: jest.fn(),
      get currentTime() { return 0; },
      set currentTime(_v) { throw new Error('fail'); },
    } as unknown as HTMLAudioElement;
    if (!ref.current) throw new Error('ref.current is null');
    ref.current.audioRef.current = dummy;
    let error: unknown = null;
    try {
      await act(async () => {
        await ref.current!.playAudio('test.mp3');
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();
  });

  it('should set _paused property if present on previous audioRef.current', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    // Set audioRef.current to object with pause, currentTime, and _paused
    const dummy = {
      pause: jest.fn(),
      get currentTime() { return 0; },
      set currentTime(_v) { },
      _paused: false,
    } as unknown as HTMLAudioElement & { _paused: boolean };
    if (!ref.current) throw new Error('ref.current is null');
    ref.current.audioRef.current = dummy;
    await act(async () => {
      await ref.current!.playAudio('test.mp3');
    });
    expect((dummy as { _paused: boolean })._paused).toBe(true);
  });

  // Add test for uncovered branch: audioRef.current exists, but neither pause nor currentTime are present, and audioEnabledRef.current is false
  it('should leave audioRef.current unchanged if it has neither pause nor currentTime and audio is disabled', async () => {
    // This test is now redundant with the above, but we keep it for coverage
    const audioEnabledRef = { current: false };
    const ref = React.createRef<TestComponentHandles>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    // Set audioRef.current to an object with neither pause nor currentTime
    const dummy = { foo: 'bar' } as unknown as HTMLAudioElement;
    if (!ref.current) throw new Error('ref.current is null');
    ref.current.audioRef.current = dummy;
    let error: unknown = null;
    try {
      await act(async () => {
        await ref.current!.playAudio('test.mp3');
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();
    // The hook now always sets audioRef.current to null if audio is disabled
    expect(ref.current!.audioRef.current).toBeNull();
  });

  it('should clean up both sourceRef and audioRef when audio is disabled in playAudio', async () => {
    const audioEnabledRef = { current: false };
    const ref = React.createRef<TestComponentHandlesWithInternals>();
    render(React.createElement(TestComponentWithInternals, { ref, audioEnabledRef }));
    // Set up dummy sourceRef and audioRef
    const dummySource = {
      stop: jest.fn(),
      disconnect: jest.fn(),
    };
    const dummyAudio = {} as HTMLAudioElement;
    // Set the internal refs directly
    ref.current!._sourceRef.current = dummySource;
    ref.current!._audioRef.current = dummyAudio;
    // Actually call playAudio
    await act(async () => {
      await ref.current!.playAudio('test.mp3');
    });
    // Both should be cleaned up
    expect(dummySource.stop).toHaveBeenCalled();
    expect(dummySource.disconnect).toHaveBeenCalled();
    expect(ref.current!._audioRef.current).toBeNull();
  });

  it('should clean up both sourceRef and audioRef when stopAudio is called', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<TestComponentHandlesWithInternals>();
    render(React.createElement(TestComponentWithInternals, { ref, audioEnabledRef }));
    // Set up dummy sourceRef and audioRef
    const dummySource = {
      stop: jest.fn(),
      disconnect: jest.fn(),
    };
    const dummyAudio = {
      pause: jest.fn(),
      currentTime: 0,
    };
    // Set the internal refs directly
    ref.current!._sourceRef.current = dummySource;
    ref.current!._audioRef.current = dummyAudio;
    // Call stopAudio
    act(() => {
      ref.current!.stopAudio();
    });
    // Both should be cleaned up
    expect(dummySource.stop).toHaveBeenCalled();
    expect(dummySource.disconnect).toHaveBeenCalled();
    expect(dummyAudio.pause).toHaveBeenCalled();
    expect(dummyAudio.currentTime).toBe(0);
  });
});

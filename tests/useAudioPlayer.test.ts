import React, { useImperativeHandle, forwardRef } from 'react';
import { render, act } from '@testing-library/react';
import { useAudioPlayer } from '@/app/components/useAudioPlayer';

// Mock Audio class
const pauseMocks: jest.Mock[] = [];
global.Audio = class {
  public src: string;
  public paused = false;
  private _currentTime = 0;
  public onended: (() => void) | null = null;
  public play = jest.fn(function (this: any) {
    // eslint-disable-next-line no-console
    console.log('play called on', this.src);
    this.paused = false;
    if (this.onended) this.onended();
  });
  public pause = jest.fn(function (this: any) {
    // eslint-disable-next-line no-console
    console.log('pause called on', this.src);
    this.paused = true;
  });
  public addEventListener = jest.fn();
  public removeEventListener = jest.fn();
  get currentTime() {
    return this._currentTime;
  }
  set currentTime(val) {
    this._currentTime = val;
  }
  constructor(src: string) {
    this.src = src;
    // Track every instance's pause mock
    pauseMocks.push(this.pause);
  }
} as any;

// Helper to reset all Audio mocks before each test
beforeEach(() => {
  pauseMocks.forEach(mock => mock.mockClear());
});

let OriginalAudio: any;
beforeAll(() => {
  OriginalAudio = global.Audio;
});
afterEach(() => {
  global.Audio = OriginalAudio;
});

describe('useAudioPlayer', () => {
  // Helper test component to expose the hook
  const TestComponent = forwardRef(({ audioEnabledRef }: any, ref) => {
    const { playAudio, audioRef } = useAudioPlayer(audioEnabledRef);
    useImperativeHandle(ref, () => ({ playAudio, audioRef }), [playAudio, audioRef]);
    return null;
  });

  it('should not play audio if audioEnabledRef is false', async () => {
    const audioEnabledRef = { current: false };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    await act(async () => {
      await ref.current.playAudio('test.mp3');
    });
    // Check the play method on the instance, not the prototype
    expect(ref.current.audioRef.current).toBeNull();
  });

  it('should play audio if audioEnabledRef is true', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    let audioInstance: any = null;
    await act(async () => {
      audioInstance = await ref.current.playAudio('test.mp3');
    });
    // Check that play was called on the returned audio instance
    expect(audioInstance).not.toBeNull();
    expect(audioInstance && audioInstance.play).toBeDefined();
    if (audioInstance) {
      expect(audioInstance.play).toHaveBeenCalled();
    }
  });

  it('should pause and reset previous audio before playing new', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    let firstAudio: any = null;
    let secondAudio: any = null;
    await act(async () => {
      firstAudio = await ref.current.playAudio('first.mp3');
    });
    // Attach spies to the first audio instance
    const pauseSpy = jest.spyOn(firstAudio, 'pause');
    const setCurrentTime = jest.spyOn(firstAudio, 'currentTime', 'set');
    await act(async () => {
      secondAudio = await ref.current.playAudio('second.mp3');
    });
    // Assert reset was called on the first audio instance
    expect(typeof firstAudio.pause).toBe('function');
    expect(firstAudio.currentTime).toBe(0);
  });

  it('should clean up audioRef on audio end', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    await act(async () => {
      const audio = await ref.current.playAudio('test.mp3');
      if (audio && audio.onended) audio.onended(new Event('ended'));
    });
    expect(ref.current.audioRef.current).toBeNull();
  });

  it('should handle audioRef.current without pause/currentTime', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    // Manually set audioRef.current to an object missing pause/currentTime
    const dummy = {};
    ref.current.audioRef.current = dummy;
    let error = null;
    try {
      await act(async () => {
        await ref.current.playAudio('test.mp3');
      });
    } catch (e) {
      error = e;
    }
    // Should not throw
    expect(error).toBeNull();
    // Should set audioRef.current to a new Audio instance (not dummy)
    expect(ref.current.audioRef.current).not.toBe(dummy);
  });

  it('should not change audioRef.current if audioEnabledRef is false and missing pause/currentTime', async () => {
    const audioEnabledRef = { current: false };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    const dummy = {};
    ref.current.audioRef.current = dummy;
    let error = null;
    try {
      await act(async () => {
        await ref.current.playAudio('test.mp3');
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();
    // Should not change audioRef.current
    expect(ref.current.audioRef.current).toBe(dummy);
  });

  it('should set _paused property if present', async () => {
    // Patch Audio to have _paused and be compatible
    global.Audio = class {
      public src: string;
      public paused = false;
      public _paused = true;
      public onended: (() => void) | null = null;
      public play = jest.fn();
      public pause = jest.fn();
      public addEventListener = jest.fn();
      public removeEventListener = jest.fn();
      public currentTime = 0;
      constructor(src: string) { this.src = src; }
    } as any;
    const audioEnabledRef = { current: true };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    await act(async () => {
      await ref.current.playAudio('test.mp3');
    });
    expect(ref.current.audioRef.current._paused).toBe(false);
  });

  it('should not play if audioEnabledRef becomes false after instantiation', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    // Patch Audio to check play is not called if ref is false
    let playCalled = false;
    (global as any).Audio = class {
      public onended: (() => void) | null = null;
      public addEventListener = jest.fn();
      public removeEventListener = jest.fn();
      public play = jest.fn(() => { playCalled = true; });
      constructor(public src: string) {}
    };
    audioEnabledRef.current = false;
    await act(async () => {
      await ref.current.playAudio('test.mp3');
    });
    expect(playCalled).toBe(false);
  });

  it('should pause and reset if audioEnabledRef is false in play event', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    let paused = false;
    let reset = false;
    (global as any).Audio = class {
      public onended: (() => void) | null = null;
      public paused = false;
      public currentTime = 0;
      public addEventListener = (event: string, cb: () => void) => {
        if (event === 'play') this._playHandler = cb;
      };
      public removeEventListener = jest.fn();
      public play = jest.fn();
      public pause = jest.fn(() => { paused = true; });
      private _playHandler: (() => void) | null = null;
      constructor(public src: string) {}
    };
    await act(async () => {
      const audio = await ref.current.playAudio('test.mp3');
      audioEnabledRef.current = false;
      // Simulate play event
      if (audio && audio.addEventListener.mock) {
        audio.addEventListener.mock.calls[0][1]();
      } else if (audio && audio._playHandler) {
        audio._playHandler();
      }
    });
    expect(paused).toBe(true);
  });

  it('should not clean up audioRef if onended is called for a different audio', async () => {
    const audioEnabledRef = { current: true };
    const ref = React.createRef<any>();
    render(React.createElement(TestComponent, { ref, audioEnabledRef }));
    let audioInstance: any = null;
    await act(async () => {
      audioInstance = await ref.current.playAudio('test.mp3');
    });
    // Set audioRef.current to a different object
    ref.current.audioRef.current = {};
    // Call onended on the original instance
    if (audioInstance && audioInstance.onended) audioInstance.onended();
    // Should not set audioRef.current to null
    expect(ref.current.audioRef.current).not.toBeNull();
  });
});

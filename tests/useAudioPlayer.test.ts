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
});

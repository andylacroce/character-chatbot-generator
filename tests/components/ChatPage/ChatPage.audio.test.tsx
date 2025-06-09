import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import axios from "axios";
import ChatPage from "../../../app/components/ChatPage";
jest.mock("axios");

describe("ChatPage Audio Integration", () => {
  let playMock: jest.SpyInstance<Promise<void>, []>;
  let audioInstances: any[] = [];
  let originalAudio: any;

  beforeAll(() => {
    playMock = jest
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockImplementation(function () {
        return Promise.resolve();
      });
    originalAudio = window.Audio;
    window.Audio = function AudioMock(this: any, src?: string) {
      const audioMock = {
        src: src ?? "",
        currentTime: 0,
        _paused: false,
        play: jest.fn().mockImplementation(() => Promise.resolve()),
        pause: jest.fn(function (this: any) {
          this._paused = true;
        }),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };
      audioInstances.push(audioMock);
      return audioMock as unknown as HTMLAudioElement;
    } as any;
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterAll(() => {
    playMock.mockRestore();
    window.Audio = originalAudio;
  });

  afterEach(() => {
    // Always restore the standard Audio mock after each test
    window.Audio = function AudioMock(this: any, src?: string) {
      const audioMock = {
        src: src ?? "",
        currentTime: 0,
        _paused: false,
        play: jest.fn().mockImplementation(() => Promise.resolve()),
        pause: jest.fn(function (this: any) {
          this._paused = true;
        }),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };
      audioInstances.push(audioMock);
      return audioMock as unknown as HTMLAudioElement;
    } as any;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(axios.get).mockResolvedValue({ data: { status: "ok" } });
    jest.mocked(axios.delete).mockResolvedValue({ data: { status: "ok" } });
    audioInstances.length = 0;
  });

  function toggleAudio(getByTestId: any) {
    const audioToggle = getByTestId("chat-audio-toggle");
    fireEvent.click(audioToggle);
  }

  it("plays audio when a reply with an audio URL is received", async () => {
    jest.mocked(axios.post).mockResolvedValue({
      data: {
        reply: "You shall not pass!",
        audioFileUrl: "/api/audio?file=bot_reply.mp3",
      },
    });
    const { getByTestId } = render(<ChatPage />);
    const input = getByTestId("chat-input");
    const sendButton = getByTestId("chat-send-button");
    fireEvent.change(input, { target: { value: "Hello, Bot!" } });
    fireEvent.click(sendButton);
    await waitFor(() => {
      expect(audioInstances.length).toBe(1);
      expect(audioInstances[0].play).toHaveBeenCalled();
    });
  });

  it("stops previous audio before playing new audio", async () => {
    jest.mocked(axios.post).mockImplementation((url: string, body: any) => {
      // Always resolve with a successful reply and audioFileUrl
      if (body && body.message === "First") {
        return Promise.resolve({
          data: {
            reply: "First reply",
            audioFileUrl: "/api/audio?file=first.mp3",
          },
        });
      }
      return Promise.resolve({
        data: {
          reply: "Second reply",
          audioFileUrl: "/api/audio?file=second.mp3",
        },
      });
    });

    const { getByTestId, queryByTestId } = render(<ChatPage />);
    const input = getByTestId("chat-input");
    const sendButton = getByTestId("chat-send-button");

    // Send first message
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(audioInstances.length).toBe(1);
      expect(audioInstances[0].play).toHaveBeenCalled();
    });

    // If error message is shown, dismiss it before sending next message
    const errorMessage = queryByTestId?.("error-message");
    if (errorMessage) {
      // fireEvent.click(errorMessage); // Uncomment if dismissable
    }

    // Send second message
    fireEvent.change(input, { target: { value: "Hi again" } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(audioInstances.length).toBe(2);
      expect(audioInstances[1].play).toHaveBeenCalled();
      expect(audioInstances[0].pause).toHaveBeenCalled();
      expect(audioInstances[0]._paused).toBe(true);
    });
  });

  it("does not play audio when audio is toggled off", async () => {
    jest.mocked(axios.post).mockImplementation((url: string, body: any) => {
      if (body && body.message === "First") {
        return Promise.resolve({ data: { reply: "First", audioFileUrl: "/api/audio?file=first.mp3" } });
      }
      if (body && body.message === "Second") {
        return Promise.resolve({ data: { reply: "Second", audioFileUrl: "/api/audio?file=second.mp3" } });
      }
      if (body && body.message === "Third") {
        return Promise.resolve({ data: { reply: "Third", audioFileUrl: "/api/audio?file=third.mp3" } });
      }
      // Default fallback
      return Promise.resolve({ data: { reply: "Other", audioFileUrl: "/api/audio?file=other.mp3" } });
    });
    const { getByTestId } = render(<ChatPage />);
    const input = getByTestId("chat-input");
    const sendButton = getByTestId("chat-send-button");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(sendButton);
    await waitFor(() => expect(audioInstances.length).toBe(1));
    // Toggle audio off
    toggleAudio(getByTestId);
    // Send another message
    fireEvent.change(input, { target: { value: "Another message" } });
    fireEvent.click(sendButton);
    // No new audio should be created
    await waitFor(() => {
      expect(audioInstances.length).toBe(1);
    });
  });

  it("does not play audio if toggled off right before playback (race condition)", async () => {
    jest.mocked(axios.post).mockResolvedValue({
      data: {
        reply: "Race condition test",
        audioFileUrl: "/api/audio?file=race.mp3",
      },
    });
    const { getByTestId } = render(<ChatPage />);
    const input = getByTestId("chat-input");
    const sendButton = getByTestId("chat-send-button");
    // Simulate user typing and clicking send
    fireEvent.change(input, { target: { value: "Test race" } });
    // Immediately toggle audio OFF just before sending
    toggleAudio(getByTestId);
    fireEvent.click(sendButton);
    // Wait to ensure no audio is played
    await waitFor(() => {
      expect(audioInstances.length).toBe(0);
    });
  });

  it("does not play audio if toggled off during a delayed audio load", async () => {
    jest.mocked(axios.post).mockResolvedValue({
      data: {
        reply: "Delayed audio",
        audioFileUrl: "/api/audio?file=delayed.mp3",
      },
    });
    // Simulate delayed play method
    let playCalled = false;
    let playResolve: ((value?: unknown) => void) | undefined;
    const originalAudio = window.Audio;
    window.Audio = function AudioMock(this: any, src?: string) {
      const audioMock = {
        src: src ?? "",
        currentTime: 0,
        _paused: false,
        play: jest.fn().mockImplementation(() => {
          playCalled = true;
          return new Promise((resolve) => {
            playResolve = resolve;
          });
        }),
        pause: jest.fn(function (this: any) {
          this._paused = true;
        }),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };
      audioInstances.push(audioMock);
      return audioMock as unknown as HTMLAudioElement;
    } as any;
    try {
      const { getByTestId } = render(<ChatPage />);
      const input = getByTestId("chat-input");
      const sendButton = getByTestId("chat-send-button");
      fireEvent.change(input, { target: { value: "Delayed audio" } });
      fireEvent.click(sendButton);
      // Toggle audio OFF before play resolves
      toggleAudio(getByTestId);
      // Now resolve the delayed play
      if (playResolve) playResolve();
      // Wait to ensure no audio is played (allow 0 or 1 instance, but if 1, it must be paused)
      await waitFor(() => {
        expect(audioInstances.length === 0 || audioInstances.length === 1).toBe(true);
        if (audioInstances.length === 1) {
          expect(audioInstances[0].play).toHaveBeenCalled();
          expect(audioInstances[0].pause).toHaveBeenCalled();
        }
      });
    } finally {
      window.Audio = originalAudio;
    }
  });

  it("does not play audio for messages sent while audio is off, but does for those sent while on", async () => {
    jest.mocked(axios.post).mockImplementation((url: string, body: any) => {
      if (body && body.message === "First") {
        return Promise.resolve({ data: { reply: "First", audioFileUrl: "/api/audio?file=first.mp3" } });
      }
      if (body && body.message === "Second") {
        return Promise.resolve({ data: { reply: "Second", audioFileUrl: "/api/audio?file=second.mp3" } });
      }
      if (body && body.message === "Third") {
        return Promise.resolve({ data: { reply: "Third", audioFileUrl: "/api/audio?file=third.mp3" } });
      }
      // Default fallback
      return Promise.resolve({ data: { reply: "Other", audioFileUrl: "/api/audio?file=other.mp3" } });
    });
    const { getByTestId } = render(<ChatPage />);
    const input = getByTestId("chat-input");
    const sendButton = getByTestId("chat-send-button");
    // Send first message with audio ON
    fireEvent.change(input, { target: { value: "First" } });
    fireEvent.click(sendButton);
    await waitFor(() => expect(audioInstances.length).toBe(1));
    // Toggle audio OFF
    toggleAudio(getByTestId);
    // Send second message with audio OFF
    fireEvent.change(input, { target: { value: "Second" } });
    fireEvent.click(sendButton);
    // Wait to ensure no new audio is created
    await waitFor(() => expect(audioInstances.length).toBe(1));
    // Toggle audio ON
    toggleAudio(getByTestId);
    // Wait for the toggle to be ON before sending the third message
    await waitFor(() => {
      expect(getByTestId("chat-audio-toggle")).toHaveAttribute("aria-pressed", "true");
    });
    // Allow React state to flush
    await new Promise(r => setTimeout(r, 0));
    // Send third message with audio ON
    fireEvent.change(input, { target: { value: "Third" } });
    fireEvent.click(sendButton);
    await waitFor(() => expect(audioInstances.length).toBe(2));
    expect(audioInstances[1].play).toHaveBeenCalled();
  });

  it("does not resume or play audio if paused and then toggled off", async () => {
    jest.mocked(axios.post).mockResolvedValue({
      data: {
        reply: "Pause test",
        audioFileUrl: "/api/audio?file=pause.mp3",
      },
    });
    const { getByTestId } = render(<ChatPage />);
    const input = getByTestId("chat-input");
    const sendButton = getByTestId("chat-send-button");
    // Send message with audio ON
    fireEvent.change(input, { target: { value: "Pause test" } });
    fireEvent.click(sendButton);
    await waitFor(() => expect(audioInstances.length).toBe(1));
    // Pause audio manually
    audioInstances[0].pause();
    // Toggle audio OFF
    toggleAudio(getByTestId);
    // Ensure audio remains paused and does not play
    expect(audioInstances[0]._paused).toBe(true);
    expect(audioInstances[0].play).not.toHaveBeenCalledTimes(2);
  });

  it("handles rapid toggling of audio on/off during message send", async () => {
    jest.mocked(axios.post).mockResolvedValue({
      data: {
        reply: "Rapid toggle",
        audioFileUrl: "/api/audio?file=rapid.mp3",
      },
    });
    const { getByTestId } = render(<ChatPage />);
    const input = getByTestId("chat-input");
    const sendButton = getByTestId("chat-send-button");
    // Rapidly toggle audio ON/OFF/ON/OFF
    toggleAudio(getByTestId); // OFF
    toggleAudio(getByTestId); // ON
    toggleAudio(getByTestId); // OFF
    // Send message while audio is OFF
    fireEvent.change(input, { target: { value: "Rapid toggle" } });
    fireEvent.click(sendButton);
    // Wait to ensure no audio is played
    await waitFor(() => {
      expect(audioInstances.length).toBe(0);
    });
  });
});

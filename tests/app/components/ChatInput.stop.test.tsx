import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatInput from "../../../app/components/ChatInput";

describe("ChatInput stop button", () => {
  it("renders stop button and calls handler on click", async () => {
    const user = userEvent.setup();
    const onStopAudio = jest.fn();
    const onSend = jest.fn();
    const onKeyDown = jest.fn();
    const onAudioToggle = jest.fn();
    const inputRef = { current: null } as React.RefObject<HTMLInputElement | null>;

    render(
      <ChatInput
        input=""
        setInput={() => {}}
        onSend={onSend}
        onKeyDown={onKeyDown}
        loading={false}
        apiAvailable={true}
        inputRef={inputRef}
        audioEnabled={true}
        onAudioToggle={onAudioToggle}
        onStopAudio={onStopAudio}
        isAudioPlaying
      />
    );

    const stopBtn = await screen.findByTestId("chat-audio-stop");
    expect(stopBtn).toBeInTheDocument();
    await user.click(stopBtn);
    expect(onStopAudio).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the input after pressing stop", async () => {
    const user = userEvent.setup();
    const onStopAudio = jest.fn();
    const inputRef = React.createRef<HTMLInputElement>();

    render(
      <ChatInput
        input=""
        setInput={() => {}}
        onSend={() => {}}
        onKeyDown={() => {}}
        loading={false}
        apiAvailable={true}
        inputRef={inputRef}
        audioEnabled={true}
        onAudioToggle={() => {}}
        onStopAudio={onStopAudio}
        isAudioPlaying
      />
    );

    const stopBtn = await screen.findByTestId("chat-audio-stop");
    expect(stopBtn).toBeInTheDocument();

    await user.click(stopBtn);

    // After stopping audio, focus should be on the input element
    expect(document.activeElement).toBe(inputRef.current);
  });

  it("does not render stop button when audio is idle", () => {
    const inputRef = { current: null } as React.RefObject<HTMLInputElement | null>;

    render(
      <ChatInput
        input=""
        setInput={() => {}}
        onSend={() => {}}
        onKeyDown={() => {}}
        loading={false}
        apiAvailable={true}
        inputRef={inputRef}
        audioEnabled={true}
        onAudioToggle={() => {}}
        onStopAudio={() => {}}
        isAudioPlaying={false}
      />
    );

    expect(screen.queryByTestId("chat-audio-stop")).not.toBeInTheDocument();
  });
});

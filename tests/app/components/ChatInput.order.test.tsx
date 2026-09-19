import React from "react";
import { render, screen } from "@testing-library/react";
import ChatInput from "../../../app/components/ChatInput";

/**
 * Regression coverage for issue #879: the send button must be the last control
 * in the composer, to the right of the audio stop/mute buttons.
 */
describe("ChatInput control order", () => {
  const renderInput = (isAudioPlaying: boolean) => {
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
        isAudioPlaying={isAudioPlaying}
      />,
    );
    return Array.from(screen.getByTestId("chat-input-container").children).map((el) =>
      el.getAttribute("data-testid"),
    );
  };

  it("puts send last, after the audio controls, while audio is playing", () => {
    expect(renderInput(true)).toEqual([
      "chat-input",
      "chat-audio-stop",
      "chat-audio-toggle",
      "chat-send-button",
    ]);
  });

  it("puts send last when audio is idle", () => {
    expect(renderInput(false)).toEqual(["chat-input", "chat-audio-toggle", "chat-send-button"]);
  });
});

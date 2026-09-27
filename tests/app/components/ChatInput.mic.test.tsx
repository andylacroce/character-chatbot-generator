import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatInput from "../../../src/app/components/ChatInput";

const baseProps = {
  input: "",
  setInput: () => {},
  onSend: () => {},
  onKeyDown: () => {},
  loading: false,
  apiAvailable: true,
  inputRef: { current: null } as React.RefObject<HTMLInputElement | null>,
  audioEnabled: true,
  onAudioToggle: () => {},
  onStopAudio: () => {},
  isAudioPlaying: false,
};

describe("ChatInput mic toggle", () => {
  it("does not render when speech is unsupported", () => {
    render(<ChatInput {...baseProps} isSpeechSupported={false} />);
    expect(screen.queryByTestId("chat-mic-toggle")).not.toBeInTheDocument();
  });

  it("does not render when isSpeechSupported is omitted", () => {
    render(<ChatInput {...baseProps} />);
    expect(screen.queryByTestId("chat-mic-toggle")).not.toBeInTheDocument();
  });

  it("renders when speech is supported and calls onMicToggle on click", async () => {
    const user = userEvent.setup();
    const onMicToggle = jest.fn();
    render(<ChatInput {...baseProps} isSpeechSupported onMicToggle={onMicToggle} />);
    const micBtn = await screen.findByTestId("chat-mic-toggle");
    expect(micBtn).toBeInTheDocument();
    await user.click(micBtn);
    expect(onMicToggle).toHaveBeenCalledTimes(1);
  });

  it("reflects recording state via aria-pressed and label", () => {
    render(<ChatInput {...baseProps} isSpeechSupported isRecording />);
    const micBtn = screen.getByTestId("chat-mic-toggle");
    expect(micBtn).toHaveAttribute("aria-pressed", "true");
    expect(micBtn).toHaveAttribute("aria-label", "Stop voice input");
  });

  it("shows the idle label and aria-pressed=false when not recording", () => {
    render(<ChatInput {...baseProps} isSpeechSupported isRecording={false} />);
    const micBtn = screen.getByTestId("chat-mic-toggle");
    expect(micBtn).toHaveAttribute("aria-pressed", "false");
    expect(micBtn).toHaveAttribute("aria-label", "Start voice input");
  });

  it("is disabled while loading or the API is unavailable", () => {
    render(<ChatInput {...baseProps} isSpeechSupported loading />);
    expect(screen.getByTestId("chat-mic-toggle")).toBeDisabled();
  });

  it("hides the mic button while audio is playing, to cap simultaneous icon buttons on mobile", () => {
    render(<ChatInput {...baseProps} isSpeechSupported isAudioPlaying />);
    expect(screen.queryByTestId("chat-mic-toggle")).not.toBeInTheDocument();
  });
});

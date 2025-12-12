import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatPage from "../../../../app/components/ChatPage";
import type { Bot } from "../../../../app/components/BotCreator";

jest.mock("../../../../app/components/useAudioPlayer", () => {
  const stopAudio = jest.fn();
  return {
    __esModule: true,
    useAudioPlayer: () => ({
      playAudio: jest.fn(),
      stopAudio,
      audioRef: { current: null },
      isAudioPlaying: true,
    }),
    _spies: { stopAudio },
  };
});

const mockBot: Bot = {
  name: "Gandalf",
  personality: "Wizard",
  avatarUrl: "/silhouette.svg",
  voiceConfig: null,
  gender: "male",
};

describe("ChatPage stop button", () => {
  it("renders stop button and is clickable", async () => {
    const user = userEvent.setup();
    render(<ChatPage bot={mockBot} />);
    const stopBtn = await screen.findByTestId("chat-audio-stop");
    expect(stopBtn).toBeInTheDocument();
    await user.click(stopBtn);
    // No assertion on side-effects here; integration of stop is covered in useAudioPlayer tests.
  });
});

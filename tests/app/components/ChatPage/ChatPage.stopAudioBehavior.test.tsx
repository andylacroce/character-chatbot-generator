import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatPage from "../../../../app/components/ChatPage";
import type { Bot } from "../../../../app/components/BotCreator";

// The server-history reconciliation effect needs a next-auth session status; default to
// unauthenticated so it's a no-op and this file's existing assertions are unaffected.
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

const stopSpy = jest.fn();
const playSpy = jest.fn();

jest.mock("../../../../app/components/useAudioPlayer", () => ({
  useAudioPlayer: () => ({
    playAudio: playSpy,
    stopAudio: stopSpy,
    audioRef: { current: null },
    isAudioPlaying: true,
  }),
  __esModule: true,
}));

const mockBot: Bot = {
  name: "Gandalf",
  personality: "Wizard",
  avatarUrl: "/silhouette.svg",
  voiceConfig: null,
  gender: "male",
};

describe("ChatPage stop button behavior", () => {
  it("clicking Stop calls stopAudio from useAudioPlayer", async () => {
    const user = userEvent.setup();

    render(<ChatPage bot={mockBot} />);
    const stopBtn = await screen.findByTestId("chat-audio-stop");
    await user.click(stopBtn);
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });
});

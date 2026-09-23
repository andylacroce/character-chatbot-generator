import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useMemo, useState, type ReactElement } from "react";
import type { Bot, ChatMessage } from "character-chatbot-shared";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import ChatScreen from "../../src/screens/ChatScreen";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  sendChatMessage: jest.fn(),
  getPersistedMessages: jest.fn(),
}));
jest.mock("../../src/storage", () => ({
  appendChatMessage: jest.fn(() => Promise.resolve()),
  loadAudioEnabled: jest.fn(() => Promise.resolve(true)),
  loadChatHistory: jest.fn(() => Promise.resolve([])),
  saveAudioEnabled: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../src/AuthContext", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut" })),
}));
jest.mock("../../src/useUserName", () => ({
  useUserName: jest.fn(),
}));
jest.mock("@react-navigation/elements", () => ({
  useHeaderHeight: () => 0,
}));

import { ApiError, getPersistedMessages, sendChatMessage } from "../../src/api";
import {
  appendChatMessage,
  loadAudioEnabled,
  loadChatHistory,
  saveAudioEnabled,
} from "../../src/storage";
import { useAuth } from "../../src/AuthContext";
import { useUserName } from "../../src/useUserName";

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseUserName = useUserName as jest.Mock;
const mockedSend = sendChatMessage as jest.Mock;

const bot: Bot = {
  name: "Sherlock Holmes",
  personality: "A brilliant detective.",
  avatarUrl: "https://example.com/a.png",
  voiceConfig: { name: "en-GB-Standard-B" } as never,
  gender: "male",
};

const existingHistory: ChatMessage[] = [
  { sender: "User", text: "hi" },
  { sender: bot.name, text: "hello" },
];

const player = { play: jest.fn(), pause: jest.fn(), replace: jest.fn(), seekTo: jest.fn() };

function withProviders(ui: ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 0, height: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

async function renderScreen() {
  const navigation = { setOptions: jest.fn(), navigate: jest.fn() };
  const route = { params: { bot } };
  const utils = await render(
    withProviders(<ChatScreen navigation={navigation as never} route={route as never} />),
  );
  return { ...utils, navigation };
}

async function sendTyped(utils: Awaited<ReturnType<typeof renderScreen>>, text: string) {
  const input = await utils.findByPlaceholderText(`Message ${bot.name}`);
  await fireEvent.changeText(input, text);
  await fireEvent.press(utils.getByLabelText("Send"));
}

describe("ChatScreen", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ status: "signedOut" });
    mockedUseUserName.mockReturnValue({ name: "" });
    (loadChatHistory as jest.Mock).mockResolvedValue([]);
    (loadAudioEnabled as jest.Mock).mockResolvedValue(true);
    (useAudioPlayer as jest.Mock).mockReturnValue(player);
    (useAudioPlayerStatus as jest.Mock).mockReturnValue({ playing: false });
  });

  it("loads existing local history without sending an intro turn", async () => {
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);

    const { findByText } = await renderScreen();

    expect(await findByText("hi")).toBeTruthy();
    expect(await findByText("hello")).toBeTruthy();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("sends, displays, persists, and plays an intro turn for a fresh guest chat", async () => {
    mockedSend.mockResolvedValue({
      reply: "Elementary, my dear.",
      audioFileUrl: "/api/audio?f=1",
      done: true,
    });

    const { findByText } = await renderScreen();

    expect(await findByText("Elementary, my dear.")).toBeTruthy();
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({ isIntro: true, botName: bot.name }),
    );
    expect(appendChatMessage).toHaveBeenCalledWith(bot.name, {
      sender: bot.name,
      text: "Elementary, my dear.",
    });
    expect(player.replace).toHaveBeenCalledWith("https://test.example.com/api/audio?f=1");
    expect(player.play).toHaveBeenCalled();
  });

  it("shows the error message when the intro turn fails", async () => {
    mockedSend.mockRejectedValue(new ApiError(503, "service unavailable"));

    const { findByText } = await renderScreen();

    expect(await findByText("service unavailable")).toBeTruthy();
  });

  it("falls back to a generic message for a non-Error intro failure", async () => {
    mockedSend.mockRejectedValue("boom");

    const { findByText } = await renderScreen();

    expect(await findByText("Failed to reach the character.")).toBeTruthy();
  });

  it("adopts the server's history when it's longer than local (signed in)", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn" });
    (loadChatHistory as jest.Mock).mockResolvedValue([{ sender: "User", text: "hi" }]);
    (getPersistedMessages as jest.Mock).mockResolvedValue(existingHistory);

    const { findByText } = await renderScreen();

    expect(await findByText("hello")).toBeTruthy();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("falls back to local history when the server fetch fails (signed in)", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn" });
    (loadChatHistory as jest.Mock).mockResolvedValue([{ sender: "User", text: "hi" }]);
    (getPersistedMessages as jest.Mock).mockRejectedValue(new Error("network down"));

    const { findByText } = await renderScreen();

    expect(await findByText("hi")).toBeTruthy();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("sends a typed message with prior history and displays the reply", async () => {
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);
    mockedSend.mockResolvedValue({ reply: "Indeed.", done: true });

    const utils = await renderScreen();
    await utils.findByText("hello");
    await sendTyped(utils, "  Are you well?  ");

    expect(await utils.findByText("Indeed.")).toBeTruthy();
    expect(utils.getByText("Are you well?")).toBeTruthy();
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Are you well?",
        conversationHistory: ["User: hi", "Bot: hello"],
        userName: undefined,
      }),
    );
    // No audio URL on the reply: nothing to play.
    expect(player.play).not.toHaveBeenCalled();
  });

  it("does nothing when the input is blank", async () => {
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);

    const utils = await renderScreen();
    await utils.findByText("hello");
    await fireEvent.changeText(utils.getByPlaceholderText(`Message ${bot.name}`), "   ");
    await fireEvent(utils.getByPlaceholderText(`Message ${bot.name}`), "submitEditing");

    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("shows an error message when sending fails", async () => {
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);
    mockedSend.mockRejectedValue(new Error("timed out"));

    const utils = await renderScreen();
    await utils.findByText("hello");
    await sendTyped(utils, "Are you well?");

    expect(await utils.findByText("timed out")).toBeTruthy();
  });

  it("falls back to a generic message for a non-Error send failure", async () => {
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);
    mockedSend.mockRejectedValue("boom");

    const utils = await renderScreen();
    await utils.findByText("hello");
    await sendTyped(utils, "Are you well?");

    expect(await utils.findByText("Failed to send message. Please try again.")).toBeTruthy();
  });

  it("labels the visitor's messages with their name and sends it with the request", async () => {
    mockedUseUserName.mockReturnValue({ name: "Andy" });
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);
    mockedSend.mockResolvedValue({ reply: "Indeed.", done: true });

    const utils = await renderScreen();
    await utils.findByText("hello");
    expect(utils.getByText("Andy")).toBeTruthy();
    await sendTyped(utils, "Are you well?");

    await waitFor(() =>
      expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({ userName: "Andy" })),
    );
  });

  it("replays a past character message through the TTS endpoint", async () => {
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);
    const utils = await renderScreen();

    await fireEvent.press(
      await utils.findByLabelText("Replay audio for Sherlock Holmes's message"),
    );

    const url = player.replace.mock.calls.at(-1)[0] as string;
    expect(url).toContain("/api/audio?");
    expect(url).toContain("text=hello");
    expect(url).toContain("gender=male");
    expect(player.play).toHaveBeenCalled();
  });

  it("disables replay while audio is muted", async () => {
    (loadAudioEnabled as jest.Mock).mockResolvedValue(false);
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);
    const utils = await renderScreen();
    await utils.findByLabelText("Unmute audio");

    await fireEvent.press(utils.getByLabelText("Replay audio for Sherlock Holmes's message"));
    expect(player.play).not.toHaveBeenCalled();
  });

  it("skips playback when audio is disabled, and survives a playback error", async () => {
    (loadAudioEnabled as jest.Mock).mockResolvedValue(false);
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);
    mockedSend.mockResolvedValue({ reply: "Indeed.", audioFileUrl: "/a.mp3", done: true });

    const utils = await renderScreen();
    await utils.findByLabelText("Unmute audio");
    await sendTyped(utils, "one");
    await utils.findByText("Indeed.");
    expect(player.play).not.toHaveBeenCalled();

    // Re-enable, then make playback throw: the reply must still render.
    await fireEvent.press(utils.getByLabelText("Unmute audio"));
    expect(saveAudioEnabled).toHaveBeenCalledWith(true);
    player.replace.mockImplementationOnce(() => {
      throw new Error("decode failed");
    });
    mockedSend.mockResolvedValue({ reply: "Quite so.", audioFileUrl: "/b.mp3", done: true });
    await sendTyped(utils, "two");
    expect(await utils.findByText("Quite so.")).toBeTruthy();
  });

  it("muting while audio plays pauses it, and the stop button pauses too", async () => {
    (useAudioPlayerStatus as jest.Mock).mockReturnValue({ playing: true });
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);

    const utils = await renderScreen();
    await utils.findByText("hello");

    await fireEvent.press(utils.getByLabelText("Stop audio"));
    expect(player.pause).toHaveBeenCalledTimes(1);

    await fireEvent.press(utils.getByLabelText("Mute audio"));
    expect(saveAudioEnabled).toHaveBeenCalledWith(false);
    expect(player.pause).toHaveBeenCalledTimes(2);
    expect(utils.getByLabelText("Unmute audio")).toBeTruthy();
  });

  it("sets a header title that opens the portrait lightbox", async () => {
    (loadChatHistory as jest.Mock).mockResolvedValue(existingHistory);

    // Render the header title in the same tree as the screen, the way the navigator would.
    function Harness() {
      const [options, setOptions] = useState<{ headerTitle?: () => ReactElement }>({});
      const navigation = useMemo(() => ({ setOptions }), []);
      return (
        <>
          {options.headerTitle?.()}
          <ChatScreen navigation={navigation as never} route={{ params: { bot } } as never} />
        </>
      );
    }
    const utils = await render(withProviders(<Harness />));
    await utils.findByText("hello");

    const before = utils.getAllByText(bot.name).length;
    await fireEvent.press(utils.getAllByText(bot.name)[0]);
    // The open lightbox adds one more caption with the character's name.
    expect(utils.getAllByText(bot.name)).toHaveLength(before + 1);
  });
});

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Alert } from "react-native";
import { useMemo, useState, type ReactElement } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAudioPlayer } from "expo-audio";
import GuessWhoScreen from "../../src/screens/GuessWhoScreen";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  startGuessWhoRound: jest.fn(),
  continueGuessWho: jest.fn(),
  sendGuessWhoMessage: jest.fn(),
  giveUpGuessWho: jest.fn(),
  getGuessWhoHighScore: jest.fn(),
  getGuessWhoLeaderboardSettings: jest.fn(),
}));
jest.mock("../../src/AuthContext", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut" })),
}));
jest.mock("../../src/useUserName", () => ({
  useUserName: jest.fn(() => ({ name: "Andy" })),
}));
jest.mock("@react-navigation/elements", () => ({
  useHeaderHeight: () => 0,
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

import {
  continueGuessWho,
  getGuessWhoHighScore,
  getGuessWhoLeaderboardSettings,
  giveUpGuessWho,
  sendGuessWhoMessage,
  startGuessWhoRound,
} from "../../src/api";

const mockedStart = startGuessWhoRound as jest.Mock;
const mockedContinue = continueGuessWho as jest.Mock;
const mockedSend = sendGuessWhoMessage as jest.Mock;
const mockedGiveUp = giveUpGuessWho as jest.Mock;

function round(overrides: Record<string, unknown> = {}) {
  return {
    guessWhoToken: "token-1",
    reply: "I once met a queen in a river of gold.",
    streak: 0,
    ...overrides,
  };
}

type HeaderOptions = { headerTitle?: () => ReactElement; headerRight?: () => ReactElement };

async function renderScreen() {
  const navigate = jest.fn();
  // Renders the header options in the same tree, the way the navigator would.
  function Harness() {
    const [options, setOptions] = useState<HeaderOptions>({});
    const navigation = useMemo(
      () => ({
        navigate,
        setOptions: (next: HeaderOptions) => setOptions((prev) => ({ ...prev, ...next })),
      }),
      [],
    );
    return (
      <>
        {options.headerTitle?.()}
        {options.headerRight?.()}
        <GuessWhoScreen navigation={navigation as never} route={{} as never} />
      </>
    );
  }
  const utils = await render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 0, height: 0 },
      }}
    >
      <ThemeProvider>
        <Harness />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, navigate };
}

async function startRun(utils: Awaited<ReturnType<typeof renderScreen>>) {
  mockedStart.mockResolvedValueOnce(round());
  await fireEvent.press(await utils.findByText("Start Game"));
  await utils.findByText("I once met a queen in a river of gold.");
}

async function send(utils: Awaited<ReturnType<typeof renderScreen>>, text: string) {
  await fireEvent.changeText(utils.getByPlaceholderText("Message ???"), text);
  await fireEvent.press(utils.getByLabelText("Send"));
}

describe("GuessWhoScreen", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await AsyncStorage.setItem("chatbot-guess-who-instructions-seen", "true");
    (getGuessWhoHighScore as jest.Mock).mockResolvedValue({ highScore: null });
    (getGuessWhoLeaderboardSettings as jest.Mock).mockResolvedValue({
      available: true,
      eligible: false,
      showOnLeaderboard: false,
      name: null,
    });
  });

  it("shows the how-to-play modal on the first visit only, and reopens it from the header", async () => {
    await AsyncStorage.removeItem("chatbot-guess-who-instructions-seen");
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByText("Got it, let's play"));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem("chatbot-guess-who-instructions-seen")).toBe("true"),
    );
    expect(utils.queryByText("Got it, let's play")).toBeNull();

    await fireEvent.press(utils.getByLabelText("How to play"));
    expect(utils.getByText("Got it, let's play")).toBeTruthy();
  });

  it("starts a run, chats with the mystery character, and shows the streak in the header", async () => {
    (getGuessWhoHighScore as jest.Mock).mockResolvedValue({ highScore: 4 });
    const utils = await renderScreen();
    await startRun(utils);
    expect(utils.getByText("Streak: 0 · Best: 4")).toBeTruthy();

    mockedSend.mockResolvedValueOnce({ reply: "I've solved a few mysteries myself." });
    await send(utils, "Are you a detective?");
    expect(await utils.findByText("I've solved a few mysteries myself.")).toBeTruthy();
    expect(mockedSend).toHaveBeenCalledWith({
      guessWhoToken: "token-1",
      message: "Are you a detective?",
      conversationHistory: ["Bot: I once met a queen in a river of gold."],
    });
  });

  it("reports a failed start", async () => {
    mockedStart.mockRejectedValueOnce(new Error("down"));
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByText("Start Game"));
    expect(await utils.findByText("Failed to start a new game. Please try again.")).toBeTruthy();
  });

  it("holds a correct guess on the Continue banner, reveals the header, then brings in a new mystery character", async () => {
    const utils = await renderScreen();
    await startRun(utils);

    mockedSend.mockResolvedValueOnce({
      reply: "You got it!",
      correct: true,
      revealedName: "Cleopatra",
      avatarUrl: "https://example.com/cleopatra.png",
      gender: "female",
      streak: 1,
    });
    await send(utils, "Cleopatra");
    expect(await utils.findByText("🎉 Correct! It was Cleopatra! Streak: 1.")).toBeTruthy();
    expect(utils.getByText("Streak: 1 · Best: 1")).toBeTruthy();

    mockedContinue.mockResolvedValueOnce(
      round({ reply: "A new voice greets you.", streak: 1 }),
    );
    await fireEvent.press(utils.getByText("Continue"));
    expect(await utils.findByText("A new voice greets you.")).toBeTruthy();
    expect(mockedContinue).toHaveBeenCalledWith("token-1");
  });

  it("shows the wrong-guess banner", async () => {
    const utils = await renderScreen();
    await startRun(utils);
    mockedSend.mockResolvedValueOnce({ reply: "No.", wrongGuessesRemaining: 1 });
    await send(utils, "Watson");
    expect(
      await utils.findByText("Not quite. You have one more guess before this run ends."),
    ).toBeTruthy();
  });

  it("confirms a give-up from the header, then shows the game-over screen", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const utils = await renderScreen();
    await startRun(utils);

    await fireEvent.press(utils.getByLabelText("Give up"));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    mockedGiveUp.mockResolvedValueOnce({
      revealedName: "Moriarty",
      avatarUrl: "https://example.com/moriarty.png",
      gender: "male",
      finalStreak: 0,
      gameOver: true,
    });
    await act(async () => buttons.find((b) => b.text === "Yes, give up")?.onPress?.());

    expect(await utils.findByText("Game Over")).toBeTruthy();
    expect(utils.getByText("It was Moriarty. Final streak: 0.")).toBeTruthy();
    expect(utils.getByText("Play Again")).toBeTruthy();
  });

  it("asks for the same confirmation when the player gives up in chat", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const utils = await renderScreen();
    await startRun(utils);
    mockedSend.mockResolvedValueOnce({ giveUpRequested: true });
    await send(utils, "I give up");
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Give up this run?",
        expect.any(String),
        expect.any(Array),
      ),
    );
  });

  it("replays a past message from its stored audio URL", async () => {
    const player = { play: jest.fn(), pause: jest.fn(), replace: jest.fn(), seekTo: jest.fn() };
    (useAudioPlayer as jest.Mock).mockReturnValue(player);
    await AsyncStorage.setItem("chatbot-guess-who-token", "stored-token");
    await AsyncStorage.setItem(
      "chatbot-guess-who-transcript",
      JSON.stringify({
        streak: 0,
        messages: [
          { sender: "???", text: "Hail, mortal.", audioFileUrl: "/api/audio?file=z.mp3" },
        ],
        roundStartIndex: 0,
        lastEvent: null,
      }),
    );
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByLabelText("Replay audio for ???'s message"));
    await waitFor(() =>
      expect(player.replace).toHaveBeenLastCalledWith(
        expect.stringContaining("/api/audio?file=z.mp3"),
      ),
    );
  });

  it("resumes a stored run and links to the leaderboard from the start screen", async () => {
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByText("View leaderboard"));
    expect(utils.navigate).toHaveBeenCalledWith("Leaderboard");

    await AsyncStorage.setItem("chatbot-guess-who-token", "stored-token");
    await AsyncStorage.setItem(
      "chatbot-guess-who-transcript",
      JSON.stringify({
        streak: 2,
        messages: [{ sender: "???", text: "Hail, mortal." }],
        roundStartIndex: 0,
        lastEvent: null,
      }),
    );
    utils.unmount();
    const resumed = await renderScreen();
    expect(await resumed.findByText("Hail, mortal.")).toBeTruthy();
  });
});

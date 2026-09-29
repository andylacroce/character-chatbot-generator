import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Alert } from "react-native";
import { useMemo, useState, type ReactElement } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GuessWhoScreen from "../../src/screens/GuessWhoScreen";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  startGuessWhoRound: jest.fn(),
  submitGuessWhoGuess: jest.fn(),
  giveUpGuessWho: jest.fn(),
  getGuessWhoHighScore: jest.fn(),
  getGuessWhoLeaderboardSettings: jest.fn(),
}));
jest.mock("../../src/AuthContext", () => ({
  useAuth: jest.fn(() => ({ status: "signedOut" })),
}));
jest.mock("@react-navigation/elements", () => ({
  useHeaderHeight: () => 0,
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

import {
  giveUpGuessWho,
  getGuessWhoHighScore,
  getGuessWhoLeaderboardSettings,
  startGuessWhoRound,
  submitGuessWhoGuess,
} from "../../src/api";

const mockedStart = startGuessWhoRound as jest.Mock;
const mockedGuess = submitGuessWhoGuess as jest.Mock;
const mockedGiveUp = giveUpGuessWho as jest.Mock;

function round(overrides: Record<string, unknown> = {}) {
  return {
    guessWhoToken: "token-1",
    clue: "Clue 1",
    clueNumber: 1,
    totalClues: 5,
    streak: 0,
    ...overrides,
  };
}

type HeaderOptions = { headerRight?: () => ReactElement };

async function renderScreen() {
  const navigate = jest.fn();
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
  await utils.findByText("Clue 1");
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

  it("starts a run and shows the first clue with the streak", async () => {
    (getGuessWhoHighScore as jest.Mock).mockResolvedValue({ highScore: 4 });
    const utils = await renderScreen();
    await startRun(utils);
    expect(utils.getByText("Streak: 0 · Best: 4")).toBeTruthy();
  });

  it("reports a failed start", async () => {
    mockedStart.mockRejectedValueOnce(new Error("down"));
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByText("Start Game"));
    expect(await utils.findByText("Failed to start a new game. Please try again.")).toBeTruthy();
  });

  it("submits a correct guess and shows the reveal banner with a Continue button", async () => {
    const utils = await renderScreen();
    await startRun(utils);

    mockedGuess.mockResolvedValueOnce({
      correct: true,
      gameOver: false,
      revealedName: "Irene Adler",
      avatarUrl: "https://example.com/irene.png",
      gender: "female",
      streak: 1,
      usedNames: ["Irene Adler"],
    });
    await fireEvent.changeText(utils.getByPlaceholderText("Who is it?"), "Irene Adler");
    await fireEvent.press(utils.getByText("Guess"));

    expect(await utils.findByText(/Correct! It was Irene Adler/)).toBeTruthy();

    mockedStart.mockResolvedValueOnce(round({ guessWhoToken: "token-2", streak: 1 }));
    await fireEvent.press(utils.getByText("Continue"));
    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(2));
  });

  it("reveals the next clue on a wrong guess", async () => {
    const utils = await renderScreen();
    await startRun(utils);
    mockedGuess.mockResolvedValueOnce({
      correct: false,
      gameOver: false,
      clue: "Clue 2",
      clueNumber: 2,
      totalClues: 5,
      streak: 0,
      guessWhoToken: "token-2",
    });
    await fireEvent.changeText(utils.getByPlaceholderText("Who is it?"), "Sherlock Holmes");
    await fireEvent.press(utils.getByText("Guess"));
    expect(await utils.findByText("Clue 2")).toBeTruthy();
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
  });

  it("resumes a stored run and links to the leaderboard from the start screen", async () => {
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByText("View leaderboard"));
    expect(utils.navigate).toHaveBeenCalledWith("Leaderboard");

    await AsyncStorage.setItem(
      "chatbot-guess-who-state",
      JSON.stringify({
        guessWhoToken: "stored-token",
        clue: "A queen from ancient Egypt.",
        clueNumber: 1,
        totalClues: 5,
        streak: 2,
        usedNames: [],
        lastEvent: null,
      }),
    );
    utils.unmount();
    const resumed = await renderScreen();
    expect(await resumed.findByText("A queen from ancient Egypt.")).toBeTruthy();
  });
});

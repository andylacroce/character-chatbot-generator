import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Alert } from "react-native";
import { useMemo, useState, type ReactElement } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAudioPlayer } from "expo-audio";
import { GAME_MYSTERY_NAME, GUESS_WHO, GUESS_WHO_NEXT } from "character-chatbot-shared";
import { GuessWhoNextScreen, GuessWhoScreen } from "../../src/screens/GameScreen";
import { ThemeProvider } from "../../src/ThemeContext";

// The transport is mocked at its own boundary (wire format and URLs are covered by
// api.test.ts and the shared createGameTransport tests), one mock set per game.
const mockTransports: Record<string, Record<string, jest.Mock>> = {};
/** Creates (once) and returns a game's mocked transport. */
function mockTransportFor(id: string) {
  return (mockTransports[id] ??= {
    start: jest.fn(),
    continueRound: jest.fn(),
    sendMessage: jest.fn(),
    giveUp: jest.fn(),
    getHighScore: jest.fn(),
  });
}
jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  gameTransport: (game: { id: string }) => mockTransportFor(game.id),
  getLeaderboardSettings: jest.fn(),
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

import { getLeaderboardSettings } from "../../src/api";

type HeaderOptions = { headerTitle?: () => ReactElement; headerRight?: () => ReactElement };

describe.each([
  { game: GUESS_WHO, Screen: GuessWhoScreen },
  { game: GUESS_WHO_NEXT, Screen: GuessWhoNextScreen },
])("GameScreen ($game.title)", ({ game, Screen }) => {
  const { copy } = game;
  const transport = () => mockTransportFor(game.id);
  // Who the header and message box show before any reveal.
  const STARTING = game.hidesSpeaker ? GAME_MYSTERY_NAME : "Sherlock Holmes";
  const reveal = game.hidesSpeaker
    ? { avatarUrl: "https://example.com/irene.png", gender: "female" }
    : {};

  /** A normalized start/continue result: a named speaker only for a shown-speaker game. */
  function round(name: string, overrides: Record<string, unknown> = {}) {
    return {
      token: `token-${name}`,
      speaker: game.hidesSpeaker ? null : { name, avatarUrl: "/silhouette.svg", gender: null },
      reply: `Greetings from ${name}.`,
      streak: 0,
      ...overrides,
    };
  }

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
          <Screen navigation={navigation as never} route={{} as never} />
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
    transport().start.mockResolvedValueOnce(round("Sherlock Holmes"));
    await fireEvent.press(await utils.findByText(copy.screen.startLabel));
    await utils.findByText("Greetings from Sherlock Holmes.");
  }

  async function send(utils: Awaited<ReturnType<typeof renderScreen>>, text: string) {
    await fireEvent.changeText(utils.getByPlaceholderText(`Message ${STARTING}`), text);
    await fireEvent.press(utils.getByLabelText("Send"));
  }

  /** Puts a stored run in AsyncStorage the way either game's earlier builds wrote it. */
  async function storeRun(
    messages: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
  ) {
    await AsyncStorage.setItem(game.storageKeys.token, "stored-token");
    await AsyncStorage.setItem(
      game.storageKeys.transcript,
      JSON.stringify({
        ...(game.hidesSpeaker
          ? {}
          : { currentCharacterName: "Zeus", avatarUrl: "/silhouette.svg", gender: "male" }),
        streak: 0,
        messages,
        roundStartIndex: 0,
        lastEvent: null,
        ...extra,
      }),
    );
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.values(mockTransports).forEach((set) =>
      Object.values(set).forEach((fn) => fn.mockReset()),
    );
    await AsyncStorage.clear();
    await AsyncStorage.setItem(game.storageKeys.instructionsSeen, "true");
    transport().getHighScore.mockResolvedValue({ highScore: null });
    (getLeaderboardSettings as jest.Mock).mockResolvedValue({
      available: true,
      eligible: false,
      showOnLeaderboard: false,
      name: null,
    });
  });

  it("shows the how-to-play modal on the first visit only, and reopens it from the header", async () => {
    await AsyncStorage.removeItem(game.storageKeys.instructionsSeen);
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByText("Got it, let's play"));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(game.storageKeys.instructionsSeen)).toBe("true"),
    );
    expect(utils.queryByText("Got it, let's play")).toBeNull();

    await fireEvent.press(utils.getByLabelText("How to play"));
    expect(utils.getByText("Got it, let's play")).toBeTruthy();
  });

  it("starts a run, chats, and shows the streak in the header", async () => {
    transport().getHighScore.mockResolvedValue({ highScore: 4 });
    const utils = await renderScreen();
    await startRun(utils);
    expect(utils.getByText("Streak: 0 · Best: 4")).toBeTruthy();

    transport().sendMessage.mockResolvedValueOnce({ reply: "Elementary." });
    await send(utils, "Who is it?");
    expect(await utils.findByText("Elementary.")).toBeTruthy();
    expect(transport().sendMessage).toHaveBeenCalledWith({
      token: "token-Sherlock Holmes",
      message: "Who is it?",
      conversationHistory: ["Bot: Greetings from Sherlock Holmes."],
    });
  });

  it("reports a failed start", async () => {
    transport().start.mockRejectedValueOnce(new Error("down"));
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByText(copy.screen.startLabel));
    expect(await utils.findByText("Failed to start a new game. Please try again.")).toBeTruthy();
  });

  it("holds a correct guess on the Continue banner, then brings in the next round", async () => {
    const utils = await renderScreen();
    await startRun(utils);

    transport().sendMessage.mockResolvedValueOnce({
      reply: "You got it!",
      correct: true,
      revealedName: "Irene Adler",
      ...reveal,
      streak: 1,
    });
    await send(utils, "Irene Adler");
    expect(await utils.findByText("🎉 Correct! It was Irene Adler! Streak: 1.")).toBeTruthy();
    expect(utils.getByText("Streak: 1 · Best: 1")).toBeTruthy();

    transport().continueRound.mockResolvedValueOnce(round("Irene Adler", { streak: 1 }));
    await fireEvent.press(utils.getByText("Continue"));
    expect(await utils.findByText("Greetings from Irene Adler.")).toBeTruthy();
    expect(transport().continueRound).toHaveBeenCalledWith("token-Sherlock Holmes");
  });

  it("shows the wrong-guess banner", async () => {
    const utils = await renderScreen();
    await startRun(utils);
    transport().sendMessage.mockResolvedValueOnce({ reply: "No.", wrongGuessesRemaining: 1 });
    await send(utils, "Watson");
    expect(await utils.findByText(copy.screen.wrongBanner)).toBeTruthy();
  });

  it("confirms a give-up from the header, then shows the game-over screen", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const utils = await renderScreen();
    await startRun(utils);

    await fireEvent.press(utils.getByLabelText("Give up"));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    transport().giveUp.mockResolvedValueOnce({
      revealedName: "Moriarty",
      ...reveal,
      finalStreak: 0,
      gameOver: true,
    });
    await act(async () => buttons.find((b) => b.text === "Yes, give up")?.onPress?.());

    expect(await utils.findByText("Game Over")).toBeTruthy();
    expect(
      utils.getByText(
        copy.screen.gameOverSubhead.replace("{name}", "Moriarty").replace("{streak}", "0"),
      ),
    ).toBeTruthy();
    expect(utils.getByText("Play Again")).toBeTruthy();
  });

  it("asks for the same confirmation when the player gives up in chat", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const utils = await renderScreen();
    await startRun(utils);
    transport().sendMessage.mockResolvedValueOnce({ giveUpRequested: true });
    await send(utils, "I give up");
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        copy.giveUpConfirm.title,
        expect.any(String),
        expect.any(Array),
      ),
    );
  });

  describe("replay audio", () => {
    const player = { play: jest.fn(), pause: jest.fn(), replace: jest.fn(), seekTo: jest.fn() };
    const SPEAKER = game.hidesSpeaker ? GAME_MYSTERY_NAME : "Zeus";

    beforeEach(() => {
      (useAudioPlayer as jest.Mock).mockReturnValue(player);
    });

    it("replays a past message from its stored audio URL", async () => {
      await storeRun([
        { sender: SPEAKER, text: "Hail, mortal.", audioFileUrl: "/api/audio?file=z.mp3" },
      ]);
      const utils = await renderScreen();
      await fireEvent.press(await utils.findByLabelText(`Replay audio for ${SPEAKER}'s message`));
      await waitFor(() =>
        expect(player.replace).toHaveBeenLastCalledWith(
          expect.stringContaining("/api/audio?file=z.mp3"),
        ),
      );
    });

    it("reuses a speaker's already-cast voiceConfig when replaying a message with no audio of its own", async () => {
      // Regression test: without this, a message whose own TTS never succeeded regenerated
      // through a context-free server-side re-cast, which can silently pick a different,
      // even differently-gendered, voice than every other line that speaker has said.
      const voiceConfig = { languageCodes: ["en-US"], name: "en-US-Standard-A", ssmlGender: 1 };
      await storeRun([
        {
          sender: SPEAKER,
          text: "Hail, mortal.",
          gender: "male",
          audioFileUrl: `/api/audio?file=z.mp3&voiceConfig=${encodeURIComponent(
            JSON.stringify(voiceConfig),
          )}`,
        },
        { sender: "User", text: "Who are you?" },
        // No audioFileUrl of its own (e.g. its TTS call failed).
        { sender: SPEAKER, text: "The king of the gods.", gender: "male" },
      ]);
      const utils = await renderScreen();
      const replayButtons = await utils.findAllByLabelText(`Replay audio for ${SPEAKER}'s message`);
      await fireEvent.press(replayButtons[replayButtons.length - 1]);
      await waitFor(() => expect(player.replace).toHaveBeenCalled());

      const url = player.replace.mock.calls.at(-1)[0] as string;
      expect(JSON.parse(decodeURIComponent(url.split("voiceConfig=")[1]))).toEqual(voiceConfig);
    });
  });

  if (game.hidesSpeaker) {
    it("shows the mystery placeholder, then the real identity once revealed", async () => {
      const utils = await renderScreen();
      await startRun(utils);
      expect(utils.getByPlaceholderText(`Message ${GAME_MYSTERY_NAME}`)).toBeTruthy();

      transport().sendMessage.mockResolvedValueOnce({
        reply: "You got it!",
        correct: true,
        revealedName: "Irene Adler",
        ...reveal,
        streak: 1,
      });
      await send(utils, "Irene Adler");
      await utils.findByText("🎉 Correct! It was Irene Adler! Streak: 1.");
      // The header and the whole round's transcript now read as the real identity.
      expect(utils.getAllByText("Irene Adler").length).toBeGreaterThan(0);
      expect(utils.queryByText(GAME_MYSTERY_NAME)).toBeNull();
    });
  }

  it("links to the leaderboard from the start screen", async () => {
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByText(copy.screen.leaderboardLabel));
    expect(utils.navigate).toHaveBeenCalledWith("Leaderboard");
  });

  it("resumes a stored run", async () => {
    await storeRun([{ sender: STARTING, text: "Hail, mortal." }], { streak: 2 });
    const utils = await renderScreen();
    expect(await utils.findByText("Hail, mortal.")).toBeTruthy();
    expect(utils.getByText("Streak: 2")).toBeTruthy();
  });
});

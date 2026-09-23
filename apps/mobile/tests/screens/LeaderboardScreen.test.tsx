import { fireEvent, render, waitFor } from "@testing-library/react-native";
import LeaderboardScreen from "../../src/screens/LeaderboardScreen";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  getLeaderboard: jest.fn(),
  getLeaderboardSettings: jest.fn(),
  saveLeaderboardSettings: jest.fn(),
}));

import {
  ApiError,
  getLeaderboard,
  getLeaderboardSettings,
  saveLeaderboardSettings,
} from "../../src/api";

const mockedList = getLeaderboard as jest.Mock;
const mockedSettings = getLeaderboardSettings as jest.Mock;
const mockedSave = saveLeaderboardSettings as jest.Mock;

const eligible = { available: true, eligible: true, showOnLeaderboard: false, name: null };

async function renderScreen() {
  const navigate = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <LeaderboardScreen navigation={{ navigate } as never} route={{} as never} />
    </ThemeProvider>,
  );
  return { ...utils, navigate };
}

describe("LeaderboardScreen", () => {
  beforeEach(() => {
    // Reset (not just clear) so a leftover one-time value can't leak between tests.
    [mockedList, mockedSettings, mockedSave].forEach((mock) => mock.mockReset());
    mockedSettings.mockResolvedValue({ ...eligible, eligible: false });
  });

  it("lists the public top ten and links to the game", async () => {
    mockedList.mockResolvedValue({ entries: [{ rank: 1, name: "Ada", streak: 9 }] });
    const utils = await renderScreen();
    expect(await utils.findByText("Ada")).toBeTruthy();
    expect(utils.getByText("9")).toBeTruthy();
    expect(utils.queryByText("You made the top 10!")).toBeNull();
    await fireEvent.press(utils.getByText("Play Guessing Game"));
    expect(utils.navigate).toHaveBeenCalledWith("Game");
  });

  it("shows the empty state", async () => {
    mockedList.mockResolvedValue({ entries: [] });
    const utils = await renderScreen();
    expect(await utils.findByText("No players have shared a top 10 score yet.")).toBeTruthy();
  });

  it("shows the load error", async () => {
    mockedList.mockRejectedValue(new Error("down"));
    const utils = await renderScreen();
    expect(
      await utils.findByText("Could not load the leaderboard. Please try again."),
    ).toBeTruthy();
  });

  it("lets a top-ten player join, rename, see the server's rejection, and leave", async () => {
    mockedList.mockResolvedValue({ entries: [] });
    mockedSettings.mockResolvedValue(eligible);
    const utils = await renderScreen();

    await fireEvent.changeText(await utils.findByLabelText("Leaderboard name"), "Ada");
    mockedSave.mockResolvedValueOnce({ ...eligible, showOnLeaderboard: true, name: "Ada" });
    await fireEvent.press(utils.getByText("Join leaderboard"));
    expect(await utils.findByText("Update name")).toBeTruthy();
    expect(mockedSave).toHaveBeenCalledWith({ showOnLeaderboard: true, name: "Ada" });
    expect(mockedList).toHaveBeenCalledTimes(2);

    mockedSave.mockRejectedValueOnce(
      new ApiError(400, JSON.stringify({ error: "Choose a different display name" })),
    );
    await fireEvent.press(utils.getByText("Update name"));
    expect(await utils.findByText("Choose a different display name")).toBeTruthy();

    mockedSave.mockResolvedValueOnce({ ...eligible, showOnLeaderboard: false, name: null });
    await fireEvent.press(utils.getByText("Remove my name"));
    await waitFor(() => expect(utils.getByText("Join leaderboard")).toBeTruthy());
  });

  it("reports when the claim settings can't load", async () => {
    mockedList.mockResolvedValue({ entries: [] });
    mockedSettings.mockRejectedValue(new Error("down"));
    const utils = await renderScreen();
    expect(await utils.findByText("Could not load your leaderboard settings.")).toBeTruthy();
  });
});

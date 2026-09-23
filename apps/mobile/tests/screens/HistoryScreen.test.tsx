import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PersistedBot } from "character-chatbot-shared";
import HistoryScreen from "../../src/screens/HistoryScreen";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  getPersistedBots: jest.fn(),
}));
jest.mock("../../src/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { getPersistedBots } from "../../src/api";
import { useAuth } from "../../src/AuthContext";

const mockedGetPersistedBots = getPersistedBots as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;

function persisted(name: string): PersistedBot {
  return {
    id: name,
    name,
    personality: "p",
    avatarUrl: null,
    voiceConfig: null,
    gender: null,
    updatedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  } as unknown as PersistedBot;
}

async function renderScreen() {
  const navigate = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <HistoryScreen navigation={{ navigate } as never} route={{} as never} />
    </ThemeProvider>,
  );
  return { ...utils, navigate };
}

describe("HistoryScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prompts a guest to sign in without fetching", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedOut" });
    const utils = await renderScreen();
    expect(utils.getByText(/Sign in to see characters/)).toBeTruthy();
    expect(mockedGetPersistedBots).not.toHaveBeenCalled();
  });

  it("lists every saved character and opens its chat on tap", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn" });
    mockedGetPersistedBots.mockResolvedValue(
      ["Ada Lovelace", "Beowulf", "Cleopatra", "Dracula", "Zeus"].map(persisted),
    );
    const utils = await renderScreen();

    // No truncation — the whole list is shown on its own screen.
    expect(await utils.findByText("Zeus")).toBeTruthy();
    expect(utils.getAllByText("2 hours ago")).toHaveLength(5);
    await fireEvent.press(utils.getByText("Ada Lovelace"));
    expect(utils.navigate).toHaveBeenCalledWith("Chat", {
      bot: expect.objectContaining({ name: "Ada Lovelace", avatarUrl: "/silhouette.svg" }),
    });
  });

  it("shows an empty state when the fetch fails", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn" });
    mockedGetPersistedBots.mockRejectedValue(new Error("down"));
    const utils = await renderScreen();
    await waitFor(() => expect(utils.getByText("No saved chats yet.")).toBeTruthy());
  });
});

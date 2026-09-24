import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { PersistedBot } from "character-chatbot-shared";
import HistoryScreen from "../../src/screens/HistoryScreen";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  getPersistedBots: jest.fn(),
  deleteSavedChats: jest.fn(),
}));
jest.mock("../../src/storage", () => ({
  clearLocalChats: jest.fn(),
}));
jest.mock("../../src/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { deleteSavedChats, getPersistedBots } from "../../src/api";
import { clearLocalChats } from "../../src/storage";
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

  describe("deleting chats", () => {
    let alertSpy: jest.SpyInstance;
    beforeEach(() => {
      mockedUseAuth.mockReturnValue({ status: "signedIn" });
      mockedGetPersistedBots.mockResolvedValue(["Zeus", "Hera"].map(persisted));
      alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    });
    afterEach(() => alertSpy.mockRestore());

    const pressConfirm = async (label: string) => {
      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => unknown }[];
      await act(async () => {
        await buttons.find((b) => b.text === label)?.onPress?.();
      });
    };

    it("deletes one chat after confirming", async () => {
      (deleteSavedChats as jest.Mock).mockResolvedValue({ cleared: 1 });
      const utils = await renderScreen();
      await fireEvent.press(await utils.findByLabelText("Delete chat with Zeus"));
      expect(alertSpy.mock.calls[0][0]).toBe("Delete your chat with Zeus?");
      expect(deleteSavedChats).not.toHaveBeenCalled();

      await pressConfirm("Delete");

      expect(deleteSavedChats).toHaveBeenCalledWith("Zeus");
      expect(clearLocalChats).toHaveBeenCalledWith("Zeus");
      await waitFor(() => expect(utils.queryByText("Zeus")).toBeNull());
      expect(utils.getByText("Hera")).toBeTruthy();
    });

    it("clears all chats after confirming", async () => {
      (deleteSavedChats as jest.Mock).mockResolvedValue({ cleared: 2 });
      const utils = await renderScreen();
      await fireEvent.press(await utils.findByText("Clear all chats"));
      await pressConfirm("Clear history");

      expect(deleteSavedChats).toHaveBeenCalledWith(undefined);
      expect(clearLocalChats).toHaveBeenCalledWith(undefined);
      expect(await utils.findByText("No saved chats yet.")).toBeTruthy();
    });

    it("keeps the chat and shows an error when the delete fails", async () => {
      (deleteSavedChats as jest.Mock).mockRejectedValue(new Error("500"));
      const utils = await renderScreen();
      await fireEvent.press(await utils.findByLabelText("Delete chat with Zeus"));
      await pressConfirm("Delete");

      expect(clearLocalChats).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenLastCalledWith("Couldn't delete this chat. Please try again.");
      expect(utils.getByText("Zeus")).toBeTruthy();
    });
  });
});

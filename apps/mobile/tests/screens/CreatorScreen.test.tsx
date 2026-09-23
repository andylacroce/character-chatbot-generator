import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useMemo, useState, type ReactElement } from "react";
import type { Bot, PersistedBot } from "character-chatbot-shared";
import CreatorScreen from "../../src/screens/CreatorScreen";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  getPersistedBots: jest.fn(),
  getRandomCharacter: jest.fn(),
  validateCharacter: jest.fn(),
}));
jest.mock("../../src/botCreation", () => ({
  createBot: jest.fn(),
  persistBotIfSignedIn: jest.fn(),
}));
jest.mock("../../src/storage", () => ({
  loadBot: jest.fn(() => Promise.resolve(null)),
  saveBot: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../src/AuthContext", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../../src/useUserName", () => ({
  useUserName: jest.fn(),
}));
// The carousel fetches its own data and animates; its own suite covers it. Here we only
// need its onSelect contract.
jest.mock("../../src/components/CharacterCarousel", () => {
  const { Pressable, Text } = require("react-native");
  return function MockCarousel({ onSelect }: { onSelect: (name: string) => void }) {
    return (
      <Pressable onPress={() => onSelect("Zeus")}>
        <Text>carousel:Zeus</Text>
      </Pressable>
    );
  };
});
jest.mock("../../src/components/AccountModal", () => {
  const { Text } = require("react-native");
  return function MockAccountModal({ visible }: { visible: boolean }) {
    return visible ? <Text>account-modal-open</Text> : null;
  };
});

import { getPersistedBots, getRandomCharacter, validateCharacter } from "../../src/api";
import { createBot, persistBotIfSignedIn } from "../../src/botCreation";
import { loadBot, saveBot } from "../../src/storage";
import { useAuth } from "../../src/AuthContext";
import { useUserName } from "../../src/useUserName";

const mockedValidate = validateCharacter as jest.Mock;
const mockedCreateBot = createBot as jest.Mock;
const mockedUseUserName = useUserName as jest.Mock;

const createdBot: Bot = {
  name: "Sherlock Holmes",
  personality: "A brilliant detective.",
  avatarUrl: "https://example.com/a.png",
  voiceConfig: null,
  gender: "male",
};

const okValidation = {
  characterName: "Sherlock Holmes",
  warningLevel: "none",
  recognized: true,
  blocked: false,
};

function persisted(name: string, id = name): PersistedBot {
  return {
    id,
    name,
    personality: "p",
    avatarUrl: null,
    voiceConfig: null,
    gender: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  } as unknown as PersistedBot;
}

let nameCtx: {
  name: string;
  isResolved: boolean;
  hasSkippedGate: boolean;
  setName: jest.Mock;
  markGateSkipped: jest.Mock;
};

async function renderScreen() {
  const navigate = jest.fn();
  // Renders headerLeft in the same tree, the way the navigator would.
  function Harness() {
    const [options, setOptions] = useState<{ headerLeft?: () => ReactElement }>({});
    const navigation = useMemo(() => ({ setOptions, navigate }), []);
    return (
      <>
        {options.headerLeft?.()}
        <CreatorScreen navigation={navigation as never} route={{} as never} />
      </>
    );
  }
  const utils = await render(
    <ThemeProvider>
      <Harness />
    </ThemeProvider>,
  );
  return { ...utils, navigate };
}

async function typeAndCreate(utils: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  await fireEvent.changeText(utils.getByPlaceholderText("e.g. Sherlock Holmes"), name);
  await fireEvent.press(utils.getByText("Create"));
}

describe("CreatorScreen", () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ status: "signedOut" });
    nameCtx = {
      name: "Andy",
      isResolved: true,
      hasSkippedGate: false,
      setName: jest.fn(),
      markGateSkipped: jest.fn(),
    };
    mockedUseUserName.mockImplementation(() => nameCtx);
    (loadBot as jest.Mock).mockResolvedValue(null);
    mockedValidate.mockResolvedValue(okValidation);
    mockedCreateBot.mockResolvedValue(createdBot);
  });

  it("requires a name before creating", async () => {
    const utils = await renderScreen();
    await fireEvent.press(utils.getByText("Create"));

    expect(await utils.findByText("Please enter a name or character.")).toBeTruthy();
    expect(mockedValidate).not.toHaveBeenCalled();
  });

  it("validates, creates, saves, persists, and opens the chat", async () => {
    const utils = await renderScreen();
    await typeAndCreate(utils, "Sherlock Holmes");

    await waitFor(() => expect(utils.navigate).toHaveBeenCalledWith("Chat", { bot: createdBot }));
    expect(mockedCreateBot).toHaveBeenCalledWith(
      "Sherlock Holmes",
      expect.any(Function),
      expect.any(Function),
      { recognized: true },
    );
    expect(saveBot).toHaveBeenCalledWith(createdBot);
    expect(persistBotIfSignedIn).toHaveBeenCalledWith(createdBot);
  });

  it("shows the progress label while creating and lets the user cancel", async () => {
    let finish!: (bot: Bot) => void;
    mockedCreateBot.mockImplementation(
      (_name, onProgress: (msg: string) => void, isCancelled: () => boolean) => {
        onProgress("Generating personality");
        return new Promise<Bot | null>((resolve) => {
          finish = (bot) => resolve(isCancelled() ? null : bot);
        });
      },
    );

    const utils = await renderScreen();
    await typeAndCreate(utils, "Sherlock Holmes");

    expect(await utils.findByText("Generating personality")).toBeTruthy();
    await fireEvent.press(utils.getByText("Cancel"));
    expect(await utils.findByText("Create")).toBeTruthy();

    finish(createdBot);
    await waitFor(() => expect(mockedCreateBot).toHaveBeenCalled());
    expect(utils.navigate).not.toHaveBeenCalledWith("Chat", expect.anything());
  });

  it("stays quiet when creation fails after the user cancelled", async () => {
    let fail!: () => void;
    mockedCreateBot.mockImplementation(
      () => new Promise((_resolve, reject) => (fail = () => reject(new Error("late failure")))),
    );

    const utils = await renderScreen();
    await typeAndCreate(utils, "Sherlock Holmes");
    await fireEvent.press(await utils.findByText("Cancel"));
    fail();

    await waitFor(() => expect(utils.queryByText("late failure")).toBeNull());
  });

  it("shows the creation error, with a generic fallback for non-Errors", async () => {
    mockedCreateBot.mockRejectedValueOnce(new Error("avatar failed"));
    const utils = await renderScreen();
    await typeAndCreate(utils, "Sherlock Holmes");
    expect(await utils.findByText("avatar failed")).toBeTruthy();

    mockedCreateBot.mockRejectedValueOnce("boom");
    await fireEvent.press(utils.getByText("Create"));
    expect(await utils.findByText("Failed to generate character. Please try again.")).toBeTruthy();
  });

  it("blocks a disallowed name without creating", async () => {
    mockedValidate.mockResolvedValue({ ...okValidation, blocked: true });

    const utils = await renderScreen();
    await typeAndCreate(utils, "Bad Name");

    expect(
      await utils.findByText("That name isn't allowed. Please choose a different name."),
    ).toBeTruthy();
    expect(mockedCreateBot).not.toHaveBeenCalled();
  });

  it("ignores a validation result that arrives after cancelling", async () => {
    let resolveValidation!: (v: unknown) => void;
    mockedValidate.mockImplementation(() => new Promise((r) => (resolveValidation = r)));

    const utils = await renderScreen();
    await typeAndCreate(utils, "Sherlock Holmes");
    await fireEvent.press(await utils.findByText("Cancel"));
    resolveValidation(okValidation);

    await waitFor(() => expect(mockedValidate).toHaveBeenCalled());
    expect(mockedCreateBot).not.toHaveBeenCalled();
  });

  it("warns on a copyright concern and continues without persistence when overridden", async () => {
    mockedValidate.mockResolvedValue({
      ...okValidation,
      characterName: "Spider-Man",
      warningLevel: "warning",
      suggestions: ["Anansi"],
    });

    const utils = await renderScreen();
    await typeAndCreate(utils, "Spider-Man");
    await fireEvent.press(await utils.findByText("Continue Anyway"));

    await waitFor(() =>
      expect(mockedCreateBot).toHaveBeenCalledWith(
        "Spider-Man",
        expect.any(Function),
        expect.any(Function),
        { skipPersistence: true, recognized: true },
      ),
    );
  });

  it("fills the input from a suggested alternative, and can cancel the warning", async () => {
    mockedValidate.mockResolvedValue({
      ...okValidation,
      characterName: "Superman",
      warningLevel: "caution",
      suggestions: ["Hercules"],
    });

    const utils = await renderScreen();
    await typeAndCreate(utils, "Superman");
    await fireEvent.press(await utils.findByText("Hercules"));
    expect(utils.getByDisplayValue("Hercules")).toBeTruthy();

    await fireEvent.press(utils.getByText("Create"));
    await fireEvent.press(await utils.findByText("Cancel"));
    await waitFor(() => expect(utils.queryByText("Continue Anyway")).toBeNull());
    expect(mockedCreateBot).not.toHaveBeenCalled();
  });

  it("asks for a description for an unrecognized name, then creates it as an original", async () => {
    mockedValidate.mockResolvedValue({ ...okValidation, recognized: false });

    const utils = await renderScreen();
    await typeAndCreate(utils, "Grumbold");
    await fireEvent.changeText(
      await utils.findByPlaceholderText(/grumpy retired dragon-slayer/),
      "A baker.",
    );
    await fireEvent.press(utils.getByText("Create Character"));

    await waitFor(() =>
      expect(mockedCreateBot).toHaveBeenCalledWith(
        "Grumbold",
        expect.any(Function),
        expect.any(Function),
        {
          description: "A baker.",
          appearanceDescription: undefined,
          skipPersistence: true,
          recognized: false,
        },
      ),
    );
  });

  it("closes the description modal on cancel without creating", async () => {
    mockedValidate.mockResolvedValue({ ...okValidation, recognized: false });

    const utils = await renderScreen();
    await typeAndCreate(utils, "Grumbold");
    await utils.findByText("Create Character");
    await fireEvent.press(utils.getByText("Cancel"));

    await waitFor(() => expect(utils.queryByText("Create Character")).toBeNull());
    expect(mockedCreateBot).not.toHaveBeenCalled();
  });

  it("fills the input with a random character, or shows an error on failure", async () => {
    (getRandomCharacter as jest.Mock).mockResolvedValueOnce({ name: "Beowulf" });
    const utils = await renderScreen();

    await fireEvent.press(utils.getByLabelText("Random character"));
    expect(await utils.findByDisplayValue("Beowulf")).toBeTruthy();

    (getRandomCharacter as jest.Mock).mockRejectedValueOnce(new Error("nope"));
    await fireEvent.press(utils.getByLabelText("Random character"));
    expect(await utils.findByText("Failed to get a random character.")).toBeTruthy();
  });

  it("creates straight from a carousel pick, skipping validation", async () => {
    const utils = await renderScreen();
    await fireEvent.press(utils.getByText("carousel:Zeus"));

    await waitFor(() =>
      expect(mockedCreateBot).toHaveBeenCalledWith(
        "Zeus",
        expect.any(Function),
        expect.any(Function),
        {
          recognized: true,
        },
      ),
    );
    expect(mockedValidate).not.toHaveBeenCalled();
  });

  describe("name gate", () => {
    beforeEach(() => {
      nameCtx.name = "";
    });

    it("asks once, saves the typed name, then resumes creation", async () => {
      const utils = await renderScreen();
      await typeAndCreate(utils, "Sherlock Holmes");

      await fireEvent.changeText(await utils.findByPlaceholderText("e.g. Andy"), " Jane ");
      await fireEvent.press(utils.getByText("Continue"));

      expect(nameCtx.setName).toHaveBeenCalledWith("Jane");
      await waitFor(() => expect(utils.navigate).toHaveBeenCalledWith("Chat", { bot: createdBot }));
    });

    it("skipping marks the gate skipped and still resumes (carousel entry point)", async () => {
      const utils = await renderScreen();
      await fireEvent.press(utils.getByText("carousel:Zeus"));
      await fireEvent.press(await utils.findByText("Skip for now"));

      expect(nameCtx.markGateSkipped).toHaveBeenCalled();
      await waitFor(() => expect(mockedCreateBot).toHaveBeenCalled());
    });

    it("continuing with a blank name counts as skipping", async () => {
      const utils = await renderScreen();
      await typeAndCreate(utils, "Sherlock Holmes");
      await fireEvent.press(await utils.findByText("Continue"));

      expect(nameCtx.markGateSkipped).toHaveBeenCalled();
      expect(nameCtx.setName).not.toHaveBeenCalled();
      await waitFor(() => expect(mockedCreateBot).toHaveBeenCalled());
    });

    it("isn't shown once the gate has been skipped before", async () => {
      nameCtx.hasSkippedGate = true;
      const utils = await renderScreen();
      await typeAndCreate(utils, "Sherlock Holmes");

      await waitFor(() => expect(mockedCreateBot).toHaveBeenCalled());
      expect(utils.queryByText("Skip for now")).toBeNull();
    });
  });

  it("offers to resume the locally saved character", async () => {
    (loadBot as jest.Mock).mockResolvedValue(createdBot);
    const utils = await renderScreen();

    await fireEvent.press(await utils.findByText("Continue chatting with"));
    expect(utils.navigate).toHaveBeenCalledWith("Chat", { bot: createdBot });
  });

  it("lists previously saved characters for a signed-in user, collapsed past three", async () => {
    (useAuth as jest.Mock).mockReturnValue({ status: "signedIn" });
    (loadBot as jest.Mock).mockResolvedValue(createdBot);
    (getPersistedBots as jest.Mock).mockResolvedValue([
      persisted("sherlock holmes"), // same as the local resume card: hidden from "Previously"
      persisted("Ada Lovelace"),
      persisted("Beowulf"),
      persisted("Cleopatra"),
      persisted("Dracula"),
    ]);

    const utils = await renderScreen();
    expect(await utils.findByText("Previously")).toBeTruthy();
    expect(utils.queryByText("Dracula")).toBeNull();

    await fireEvent.press(utils.getByText("Show 1 more"));
    expect(utils.getByText("Dracula")).toBeTruthy();
    await fireEvent.press(utils.getByText("Show less"));
    expect(utils.queryByText("Dracula")).toBeNull();

    await fireEvent.press(utils.getByText("Ada Lovelace"));
    expect(utils.navigate).toHaveBeenCalledWith(
      "Chat",
      expect.objectContaining({ bot: expect.objectContaining({ name: "Ada Lovelace" }) }),
    );
  });

  it("hides the Previously section if the saved-characters fetch fails", async () => {
    (useAuth as jest.Mock).mockReturnValue({ status: "signedIn" });
    (getPersistedBots as jest.Mock).mockRejectedValue(new Error("down"));

    const utils = await renderScreen();
    await waitFor(() => expect(getPersistedBots).toHaveBeenCalled());
    expect(utils.queryByText("Previously")).toBeNull();
  });

  it("opens the account modal from the header, labeled by sign-in state", async () => {
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByLabelText("Sign in"));
    expect(utils.getByText("account-modal-open")).toBeTruthy();
  });

  it("labels the header button Account when signed in", async () => {
    (useAuth as jest.Mock).mockReturnValue({ status: "signedIn" });
    (getPersistedBots as jest.Mock).mockResolvedValue([]);
    const utils = await renderScreen();
    expect(await utils.findByLabelText("Account")).toBeTruthy();
  });

  it("links to the Character Wall", async () => {
    const utils = await renderScreen();
    await fireEvent.press(utils.getByText("Browse the Character Wall"));
    expect(utils.navigate).toHaveBeenCalledWith("CharWall");
  });
});

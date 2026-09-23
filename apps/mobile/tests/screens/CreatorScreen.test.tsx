import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { useMemo, useState, type ReactElement } from "react";
import type { Bot } from "character-chatbot-shared";
import CreatorScreen from "../../src/screens/CreatorScreen";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  getRandomCharacter: jest.fn(),
  validateCharacter: jest.fn(),
  generatePersonality: jest.fn(),
  generateAvatar: jest.fn(),
  getVoiceConfig: jest.fn(),
}));
jest.mock("../../src/botCreation", () => ({
  ...jest.requireActual("../../src/botCreation"),
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

import {
  getRandomCharacter,
  validateCharacter,
  generatePersonality,
  generateAvatar,
  getVoiceConfig,
} from "../../src/api";
import { persistBotIfSignedIn } from "../../src/botCreation";
import { loadBot, saveBot } from "../../src/storage";
import { useAuth } from "../../src/AuthContext";
import { useUserName } from "../../src/useUserName";

const mockedValidate = validateCharacter as jest.Mock;
const mockedGeneratePersonality = generatePersonality as jest.Mock;
const mockedGenerateAvatar = generateAvatar as jest.Mock;
const mockedGetVoiceConfig = getVoiceConfig as jest.Mock;
const mockedUseUserName = useUserName as jest.Mock;

const voiceCfg = { name: "en-US-Wavenet-A", languageCodes: ["en-US"], ssmlGender: 1 };
const createdBot: Bot = {
  name: "Sherlock Holmes",
  personality: "A brilliant detective.",
  avatarUrl: "https://example.com/a.png",
  voiceConfig: voiceCfg,
  gender: "male",
  skipPersistence: false,
};

const okValidation = {
  characterName: "Sherlock Holmes",
  warningLevel: "none",
  recognized: true,
  blocked: false,
};

let nameCtx: {
  name: string;
  isResolved: boolean;
  hasSkippedGate: boolean;
  setName: jest.Mock;
  markGateSkipped: jest.Mock;
};

async function renderScreen() {
  const navigate = jest.fn();
  const focusListeners: (() => void)[] = [];
  const addListener = (_event: "focus", cb: () => void) => {
    focusListeners.push(cb);
    return () => {};
  };
  function Harness() {
    const [options, setOptions] = useState<{ headerLeft?: () => ReactElement }>({});
    const navigation = useMemo(() => ({ setOptions, navigate, addListener }), []);
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
  const focus = () => act(() => focusListeners.forEach((cb) => cb()));
  return { ...utils, navigate, focus };
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
    mockedGeneratePersonality.mockResolvedValue({
      personality: "A brilliant detective.",
      correctedName: "Sherlock Holmes",
    });
    mockedGenerateAvatar.mockResolvedValue({
      avatarUrl: "https://example.com/a.png",
      gender: "male",
    });
    mockedGetVoiceConfig.mockResolvedValue(voiceCfg);
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
    expect(saveBot).toHaveBeenCalledWith(createdBot);
    expect(persistBotIfSignedIn).toHaveBeenCalledWith(createdBot);
  });

  it("shows the progress label while creating and lets the user cancel", async () => {
    let finishPersonality!: () => void;
    mockedGeneratePersonality.mockImplementation(
      () =>
        new Promise<{ personality: string; correctedName: string }>((resolve) => {
          finishPersonality = () => resolve({ personality: "test", correctedName: "Test" });
        }),
    );

    const utils = await renderScreen();
    await typeAndCreate(utils, "Sherlock Holmes");

    expect(await utils.findByText("Creating personality")).toBeTruthy();
    await fireEvent.press(utils.getByText("Cancel"));
    expect(await utils.findByText("Create")).toBeTruthy();

    finishPersonality();
    await waitFor(() => expect(mockedGeneratePersonality).toHaveBeenCalled());
    expect(utils.navigate).not.toHaveBeenCalledWith("Chat", expect.anything());
  });

  it("stays quiet when creation fails after the user cancelled", async () => {
    let fail!: () => void;
    mockedGetVoiceConfig.mockImplementation(
      () => new Promise((_resolve, reject) => (fail = () => reject(new Error("late failure")))),
    );

    const utils = await renderScreen();
    await typeAndCreate(utils, "Sherlock Holmes");
    await fireEvent.press(await utils.findByText("Cancel"));
    fail();

    await waitFor(() => expect(utils.queryByText("late failure")).toBeNull());
  });

  it("shows a voice error when voice config fails", async () => {
    mockedGetVoiceConfig.mockRejectedValueOnce(new Error("voice failed"));
    const utils = await renderScreen();
    await typeAndCreate(utils, "Sherlock Holmes");
    expect(await utils.findByText("Failed to generate character. Please try again.")).toBeTruthy();
  });

  it("blocks a disallowed name without creating", async () => {
    mockedValidate.mockResolvedValue({ ...okValidation, blocked: true });

    const utils = await renderScreen();
    await typeAndCreate(utils, "Bad Name");

    expect(
      await utils.findByText("That name isn't allowed. Please choose a different name."),
    ).toBeTruthy();
    expect(mockedGeneratePersonality).not.toHaveBeenCalled();
  });

  it("ignores a validation result that arrives after cancelling", async () => {
    let resolveValidation!: (v: unknown) => void;
    mockedValidate.mockImplementation(() => new Promise((r) => (resolveValidation = r)));

    const utils = await renderScreen();
    await typeAndCreate(utils, "Sherlock Holmes");
    await fireEvent.press(await utils.findByText("Cancel"));
    resolveValidation(okValidation);

    await waitFor(() => expect(mockedValidate).toHaveBeenCalled());
    expect(mockedGeneratePersonality).not.toHaveBeenCalled();
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

    await waitFor(() => expect(utils.navigate).toHaveBeenCalledWith("Chat", expect.anything()));
    // persistBotIfSignedIn skips a skipPersistence bot, so it never reaches the account
    expect(persistBotIfSignedIn).toHaveBeenCalledWith(
      expect.objectContaining({ skipPersistence: true }),
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
    expect(mockedGeneratePersonality).not.toHaveBeenCalled();
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

    await waitFor(() => expect(utils.navigate).toHaveBeenCalledWith("Chat", expect.anything()));
    expect(mockedGeneratePersonality).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Grumbold", description: "A baker." }),
    );
  });

  it("closes the description modal on cancel without creating", async () => {
    mockedValidate.mockResolvedValue({ ...okValidation, recognized: false });

    const utils = await renderScreen();
    await typeAndCreate(utils, "Grumbold");
    await utils.findByText("Create Character");
    await fireEvent.press(utils.getByText("Cancel"));

    await waitFor(() => expect(utils.queryByText("Create Character")).toBeNull());
    expect(mockedGeneratePersonality).not.toHaveBeenCalled();
  });

  it("fills the input with a random character, falling back to a default on failure", async () => {
    (getRandomCharacter as jest.Mock).mockResolvedValueOnce({ name: "Beowulf" });
    const utils = await renderScreen();

    await fireEvent.press(utils.getByLabelText("Random character"));
    expect(await utils.findByDisplayValue("Beowulf")).toBeTruthy();

    (getRandomCharacter as jest.Mock).mockRejectedValueOnce(new Error("nope"));
    await fireEvent.press(utils.getByLabelText("Random character"));
    expect(await utils.findByDisplayValue("Sherlock Holmes")).toBeTruthy();
  });

  it("validates and creates from a carousel tap", async () => {
    mockedValidate.mockResolvedValue({ ...okValidation, characterName: "Zeus" });
    const utils = await renderScreen();
    await fireEvent.press(utils.getByText("carousel:Zeus"));

    await waitFor(() => expect(utils.navigate).toHaveBeenCalledWith("Chat", expect.anything()));
    expect(mockedValidate).toHaveBeenCalledWith("Zeus");
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
      mockedValidate.mockResolvedValue({ ...okValidation, characterName: "Zeus" });
      const utils = await renderScreen();
      await fireEvent.press(utils.getByText("carousel:Zeus"));
      await fireEvent.press(await utils.findByText("Skip for now"));

      expect(nameCtx.markGateSkipped).toHaveBeenCalled();
      await waitFor(() => expect(mockedGeneratePersonality).toHaveBeenCalled());
    });

    it("continuing with a blank name counts as skipping", async () => {
      const utils = await renderScreen();
      await typeAndCreate(utils, "Sherlock Holmes");
      await fireEvent.press(await utils.findByText("Continue"));

      expect(nameCtx.markGateSkipped).toHaveBeenCalled();
      expect(nameCtx.setName).not.toHaveBeenCalled();
      await waitFor(() => expect(mockedGeneratePersonality).toHaveBeenCalled());
    });

    it("isn't shown once the gate has been skipped before", async () => {
      nameCtx.hasSkippedGate = true;
      const utils = await renderScreen();
      await typeAndCreate(utils, "Sherlock Holmes");

      await waitFor(() => expect(mockedGeneratePersonality).toHaveBeenCalled());
      expect(utils.queryByText("Skip for now")).toBeNull();
    });
  });

  it("offers to resume the locally saved character", async () => {
    (loadBot as jest.Mock).mockResolvedValue(createdBot);
    const utils = await renderScreen();

    await fireEvent.press(await utils.findByText("Continue chatting with"));
    expect(utils.navigate).toHaveBeenCalledWith("Chat", { bot: createdBot });
  });

  it("refreshes the resume card when the screen regains focus", async () => {
    const utils = await renderScreen();
    expect(utils.queryByText("Continue chatting with")).toBeNull();

    (loadBot as jest.Mock).mockResolvedValue(createdBot);
    await utils.focus();
    expect(await utils.findByText("Continue chatting with")).toBeTruthy();
  });

  it("links a signed-in user to Past chats", async () => {
    (useAuth as jest.Mock).mockReturnValue({ status: "signedIn" });
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByText("Past chats"));
    expect(utils.navigate).toHaveBeenCalledWith("History");
  });

  it("hides the Past chats link from guests", async () => {
    const utils = await renderScreen();
    expect(utils.queryByText("Past chats")).toBeNull();
  });

  it("opens the account modal from the header, labeled by sign-in state", async () => {
    const utils = await renderScreen();
    await fireEvent.press(await utils.findByLabelText("Sign in"));
    expect(utils.getByText("account-modal-open")).toBeTruthy();
  });

  it("labels the header button Account when signed in", async () => {
    (useAuth as jest.Mock).mockReturnValue({ status: "signedIn" });
    const utils = await renderScreen();
    expect(await utils.findByLabelText("Account")).toBeTruthy();
  });

  it("links to the Character Wall", async () => {
    const utils = await renderScreen();
    await fireEvent.press(utils.getByText("Character Wall"));
    expect(utils.navigate).toHaveBeenCalledWith("CharWall");
  });
});

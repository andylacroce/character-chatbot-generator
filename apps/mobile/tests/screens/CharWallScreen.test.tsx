import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { CharacterEntry } from "character-chatbot-shared";
import CharWallScreen from "../../src/screens/CharWallScreen";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  getChars: jest.fn(),
}));
jest.mock("character-chatbot-shared", () => ({
  ...jest.requireActual("character-chatbot-shared"),
  generateCharacter: jest.fn(),
}));
jest.mock("../../src/botCreation", () => ({
  mobileTransport: {},
  persistBotIfSignedIn: jest.fn(),
}));
jest.mock("../../src/storage", () => ({
  saveBot: jest.fn(),
}));

// The real FlatList's underlying VirtualizedList schedules a real (unmocked) setTimeout to
// decide which cells to render, which otherwise logs stray "not wrapped in act()" warnings
// once it fires outside any test's own act scope. A trivial, non-virtualized stand-in avoids
// that entirely; CharWallScreen only relies on FlatList for `data`/`renderItem`/`keyExtractor`/
// `onEndReached`/`ListFooterComponent`, all preserved here.
jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  function MockFlatList({
    data,
    renderItem,
    keyExtractor,
    ListFooterComponent,
    onEndReached,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown, index: number) => string;
    ListFooterComponent?: React.ReactNode;
    onEndReached?: () => void;
  }) {
    return (
      <RN.View testID="mock-flatlist" onEndReached={onEndReached}>
        {data.map((item, index) => (
          <RN.View key={keyExtractor ? keyExtractor(item, index) : index}>
            {renderItem({ item, index })}
          </RN.View>
        ))}
        {ListFooterComponent}
      </RN.View>
    );
  }
  // A plain `{ ...RN, FlatList: MockFlatList }` spread eagerly evaluates every one of
  // react-native's lazy-getter exports (its real index.js defines each module via a lazy
  // `get()`) to copy them into a new object — which crashes here on `DevMenu`, a TurboModule
  // that's never registered in this test environment and is normally never touched because
  // nothing else accesses it. A Proxy only resolves a property when something actually reads
  // it, so every export CharWallScreen's tree really uses still resolves normally and lazily.
  return new Proxy(RN, {
    get(target, prop) {
      return prop === "FlatList" ? MockFlatList : target[prop as keyof typeof target];
    },
  });
});

import { getChars } from "../../src/api";
import { generateCharacter } from "character-chatbot-shared";
import { persistBotIfSignedIn } from "../../src/botCreation";
import { saveBot } from "../../src/storage";

const oneChar: CharacterEntry = {
  name: "Sherlock Holmes",
  avatarUrl: "https://example.com/a.png",
} as CharacterEntry;
const svgChar: CharacterEntry = { name: "Zeus", avatarUrl: "/silhouette.svg" } as CharacterEntry;

async function renderScreen() {
  const navigation = { navigate: jest.fn() };
  const utils = await render(
    <ThemeProvider>
      <CharWallScreen navigation={navigation as never} route={{} as never} />
    </ThemeProvider>,
  );
  return { ...utils, navigation };
}

describe("CharWallScreen", () => {
  it("shows a loading spinner while the first page loads", async () => {
    (getChars as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { queryByTestId } = await renderScreen();
    expect(queryByTestId("mock-flatlist")).toBeNull();
  });

  it("shows an error state when the first page fails to load", async () => {
    (getChars as jest.Mock).mockRejectedValue(new Error("network down"));
    const { findByText } = await renderScreen();
    expect(
      await findByText("Couldn't load the gallery right now — try again in a bit."),
    ).toBeTruthy();
  });

  it("shows an empty state when there are no characters", async () => {
    (getChars as jest.Mock).mockResolvedValue({ characters: [], hasMore: false });
    const { findByText } = await renderScreen();
    expect(await findByText("No characters yet — go create the first one!")).toBeTruthy();
  });

  it("renders a tile per character, including an .svg fallback initial", async () => {
    (getChars as jest.Mock).mockResolvedValue({ characters: [oneChar, svgChar], hasMore: false });
    const { findByText } = await renderScreen();
    expect(await findByText("Sherlock Holmes")).toBeTruthy();
    expect(await findByText("Zeus")).toBeTruthy();
    expect(await findByText("Z")).toBeTruthy();
  });

  it("opens the lightbox for a tapped character", async () => {
    (getChars as jest.Mock).mockResolvedValue({ characters: [oneChar], hasMore: false });
    const { findByText, findAllByText } = await renderScreen();

    fireEvent.press(await findByText("Sherlock Holmes"));
    await findByText("Chat with Sherlock Holmes");

    expect((await findAllByText("Sherlock Holmes")).length).toBeGreaterThanOrEqual(2);
  });

  it("creates, saves, persists, and navigates to Chat on successful chat-with", async () => {
    (getChars as jest.Mock).mockResolvedValue({ characters: [oneChar], hasMore: false });
    const bot = { name: "Sherlock Holmes", personality: "p" } as never;
    (generateCharacter as jest.Mock).mockResolvedValue(bot);

    const { findByText, navigation } = await renderScreen();
    fireEvent.press(await findByText("Sherlock Holmes"));
    fireEvent.press(await findByText("Chat with Sherlock Holmes"));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith("Chat", { bot }));
    expect(saveBot).toHaveBeenCalledWith(bot);
    expect(persistBotIfSignedIn).toHaveBeenCalledWith(bot);
  });

  it("shows an error message when chat-with creation throws", async () => {
    (getChars as jest.Mock).mockResolvedValue({ characters: [oneChar], hasMore: false });
    (generateCharacter as jest.Mock).mockRejectedValue(new Error("personality service down"));

    const { findByText } = await renderScreen();
    fireEvent.press(await findByText("Sherlock Holmes"));
    fireEvent.press(await findByText("Chat with Sherlock Holmes"));

    expect(await findByText("personality service down")).toBeTruthy();
  });

  it("loads the next page on onEndReached and appends to the grid", async () => {
    (getChars as jest.Mock)
      .mockResolvedValueOnce({ characters: [oneChar], hasMore: true })
      .mockResolvedValueOnce({ characters: [svgChar], hasMore: false });

    const { findByText, getByTestId } = await renderScreen();
    await findByText("Sherlock Holmes");

    fireEvent(getByTestId("mock-flatlist"), "onEndReached");

    expect(await findByText("Zeus")).toBeTruthy();
    expect(getChars).toHaveBeenCalledTimes(2);
  });
});

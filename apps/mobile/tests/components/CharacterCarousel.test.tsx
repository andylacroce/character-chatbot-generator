import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { CharacterEntry } from "character-chatbot-shared";
import CharacterCarousel from "../../src/components/CharacterCarousel";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  getCarouselSample: jest.fn(),
}));

import { getCarouselSample } from "../../src/api";

// A single entry keeps the rotate-interval effect a no-op (it requires >= 2 characters),
// which keeps these tests deterministic without needing to fake-advance a live interval.
const oneCharacter: CharacterEntry[] = [
  { name: "Sherlock Holmes", avatarUrl: null } as unknown as CharacterEntry,
];

async function renderCarousel(props: Partial<React.ComponentProps<typeof CharacterCarousel>> = {}) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 0, height: 0 },
      }}
    >
      <ThemeProvider>
        <CharacterCarousel onSelect={jest.fn()} {...props} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe("CharacterCarousel", () => {
  it("renders nothing before the character pool has loaded", async () => {
    (getCarouselSample as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { queryByLabelText } = await renderCarousel();
    expect(queryByLabelText("Next character")).toBeNull();
  });

  it("renders nothing when the fetch fails", async () => {
    (getCarouselSample as jest.Mock).mockRejectedValue(new Error("network down"));
    const { queryByLabelText } = await renderCarousel();
    await waitFor(() => expect(queryByLabelText("Next character")).toBeNull());
  });

  it("renders the character name pill once the pool loads", async () => {
    (getCarouselSample as jest.Mock).mockResolvedValue(oneCharacter);
    const { findByText } = await renderCarousel();
    expect(await findByText("Sherlock Holmes")).toBeTruthy();
  });

  it("calls onSelect with the character's name on tap", async () => {
    (getCarouselSample as jest.Mock).mockResolvedValue(oneCharacter);
    const onSelect = jest.fn();
    const { findByLabelText } = await renderCarousel({ onSelect });

    const button = await findByLabelText("Chat with Sherlock Holmes");
    fireEvent.press(button);

    expect(onSelect).toHaveBeenCalledWith("Sherlock Holmes");
  });

  it("does not call onSelect while disabled", async () => {
    (getCarouselSample as jest.Mock).mockResolvedValue(oneCharacter);
    const onSelect = jest.fn();
    const { findByLabelText } = await renderCarousel({ onSelect, disabled: true });

    const button = await findByLabelText("Chat with Sherlock Holmes");
    fireEvent.press(button);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("steps forward and back with the arrow buttons, wrapping at the ends", async () => {
    (getCarouselSample as jest.Mock).mockResolvedValue([
      { name: "Sherlock Holmes", avatarUrl: null },
      { name: "Cleopatra", avatarUrl: null },
    ]);
    const { findByLabelText, getByLabelText } = await renderCarousel();
    await findByLabelText("Chat with Sherlock Holmes");

    await fireEvent.press(getByLabelText("Next character"));
    expect(getByLabelText("Chat with Cleopatra")).toBeTruthy();
    await fireEvent.press(getByLabelText("Next character"));
    expect(getByLabelText("Chat with Sherlock Holmes")).toBeTruthy();
    await fireEvent.press(getByLabelText("Previous character"));
    expect(getByLabelText("Chat with Cleopatra")).toBeTruthy();
  });
});

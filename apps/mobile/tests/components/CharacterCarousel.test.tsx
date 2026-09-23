import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Animated } from "react-native";
import type { CharacterEntry } from "character-chatbot-shared";
import CharacterCarousel from "../../src/components/CharacterCarousel";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/api", () => ({
  ...jest.requireActual("../../src/api"),
  getCarouselSample: jest.fn(),
}));

import { getCarouselSample } from "../../src/api";

// Animated's real timing/spring never resolve deterministically under this environment's
// fake timers — replace with synchronous stand-ins so the flip/press callbacks this
// component depends on (setDisplayIndex, the haptic tick) actually fire during a test.
jest.spyOn(Animated, "timing").mockImplementation(
  (value, config) =>
    ({
      start: (cb?: (result: { finished: boolean }) => void) => {
        (value as Animated.Value).setValue(config.toValue as number);
        cb?.({ finished: true });
      },
      stop: () => {},
      reset: () => {},
    }) as unknown as Animated.CompositeAnimation,
);
jest.spyOn(Animated, "spring").mockImplementation(
  () =>
    ({
      start: (cb?: (result: { finished: boolean }) => void) => cb?.({ finished: true }),
      stop: () => {},
      reset: () => {},
    }) as unknown as Animated.CompositeAnimation,
);
jest.spyOn(Animated, "loop").mockImplementation(
  () =>
    ({
      start: () => {},
      stop: () => {},
      reset: () => {},
    }) as unknown as Animated.CompositeAnimation,
);

// A single entry keeps the rotate-interval effect a no-op (it requires >= 2 characters),
// which keeps these tests deterministic without needing to fake-advance a live interval.
const oneCharacter: CharacterEntry[] = [
  { name: "Sherlock Holmes", avatarUrl: null } as unknown as CharacterEntry,
];

async function renderCarousel(props: Partial<React.ComponentProps<typeof CharacterCarousel>> = {}) {
  return render(
    <ThemeProvider>
      <CharacterCarousel onSelect={jest.fn()} {...props} />
    </ThemeProvider>,
  );
}

describe("CharacterCarousel", () => {
  it("renders nothing before the character pool has loaded", async () => {
    (getCarouselSample as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { toJSON } = await renderCarousel();
    expect(toJSON()).toBeNull();
  });

  it("renders nothing when the fetch fails", async () => {
    (getCarouselSample as jest.Mock).mockRejectedValue(new Error("network down"));
    const { toJSON } = await renderCarousel();
    await waitFor(() => expect(toJSON()).toBeNull());
  });

  it("renders the character once the pool loads", async () => {
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
});

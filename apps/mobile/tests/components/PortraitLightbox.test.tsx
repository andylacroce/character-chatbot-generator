import { fireEvent, render } from "@testing-library/react-native";
import PortraitLightbox from "../../src/components/PortraitLightbox";
import { ThemeProvider } from "../../src/ThemeContext";

function renderLightbox(props: Partial<React.ComponentProps<typeof PortraitLightbox>> = {}) {
  return render(
    <ThemeProvider>
      <PortraitLightbox
        visible
        name="Sherlock Holmes"
        avatarUrl={null}
        onClose={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe("PortraitLightbox", () => {
  it("shows the character's initial when there is no usable avatar", async () => {
    const { findByText } = await renderLightbox({ avatarUrl: null });
    expect(await findByText("S")).toBeTruthy();
  });

  it("treats a .svg avatarUrl as unusable, falling back to the initial", async () => {
    const { findByText } = await renderLightbox({ avatarUrl: "/silhouette.svg" });
    expect(await findByText("S")).toBeTruthy();
  });

  it("always shows the character's name", async () => {
    const { findByText } = await renderLightbox({ avatarUrl: "https://example.com/a.png" });
    expect(await findByText("Sherlock Holmes")).toBeTruthy();
  });

  it("omits the action button when none is given", async () => {
    const { queryByText } = await renderLightbox();
    expect(queryByText(/Chat with/)).toBeNull();
  });

  it("renders and fires an optional action", async () => {
    const onPress = jest.fn();
    const { findByText } = await renderLightbox({
      action: { label: "Chat with Sherlock Holmes", onPress },
    });
    fireEvent.press(await findByText("Chat with Sherlock Holmes"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is pressed", async () => {
    const onClose = jest.fn();
    const { findByLabelText } = await renderLightbox({ onClose });
    fireEvent.press(await findByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

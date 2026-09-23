import { fireEvent, render } from "@testing-library/react-native";
import Avatar from "../../src/components/Avatar";
import { ThemeProvider } from "../../src/ThemeContext";

function renderAvatar(props: Partial<React.ComponentProps<typeof Avatar>>) {
  return render(
    <ThemeProvider>
      <Avatar name="Sherlock Holmes" avatarUrl={null} {...props} />
    </ThemeProvider>,
  );
}

describe("Avatar", () => {
  it("shows the character's initial when there is no avatarUrl", async () => {
    const { findByText } = await renderAvatar({ avatarUrl: null });
    expect(await findByText("S")).toBeTruthy();
  });

  it("falls back to a question mark for a blank name", async () => {
    const { findByText } = await renderAvatar({ name: "   ", avatarUrl: null });
    expect(await findByText("?")).toBeTruthy();
  });

  it("falls back to the initial for an .svg avatarUrl (generate-avatar's own fallback shape)", async () => {
    const { findByText } = await renderAvatar({ avatarUrl: "/silhouette.svg" });
    expect(await findByText("S")).toBeTruthy();
  });

  it("renders the real image when a usable avatarUrl is given", async () => {
    const { queryByText } = await renderAvatar({ avatarUrl: "https://example.com/a.png" });
    expect(queryByText("S")).toBeNull();
  });

  it("falls back to the initial after the image fails to load", async () => {
    const { getByTestId, findByText } = await renderAvatar({
      avatarUrl: "https://example.com/a.png",
    });

    fireEvent(getByTestId("avatar-image"), "onError", { nativeEvent: { error: "failed" } });

    expect(await findByText("S")).toBeTruthy();
  });

  it("is not pressable without an onPress handler", async () => {
    const { queryByLabelText } = await renderAvatar({ avatarUrl: null });
    expect(queryByLabelText(/View .* portrait/)).toBeNull();
  });

  it("is pressable and fires onPress when given", async () => {
    const onPress = jest.fn();
    const { findByLabelText } = await renderAvatar({ avatarUrl: null, onPress });
    fireEvent.press(await findByLabelText("View Sherlock Holmes's portrait"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render } from "@testing-library/react-native";
import CharacterDescriptionModal from "../../src/components/CharacterDescriptionModal";
import { ThemeProvider } from "../../src/ThemeContext";

function renderModal(props: Partial<React.ComponentProps<typeof CharacterDescriptionModal>> = {}) {
  return render(
    <ThemeProvider>
      <CharacterDescriptionModal
        visible
        characterName="Zorblax"
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe("CharacterDescriptionModal", () => {
  it("shows the character name being described", async () => {
    const { findByText } = await renderModal();
    expect(await findByText('"Zorblax"')).toBeTruthy();
  });

  it("disables Create Character until a description is typed", async () => {
    const onSubmit = jest.fn();
    const { findByText, findByPlaceholderText } = await renderModal({ onSubmit });

    fireEvent.press(await findByText("Create Character"));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.changeText(
      await findByPlaceholderText(/A grumpy retired dragon-slayer/),
      "A cheerful robot chef.",
    );
    fireEvent.press(await findByText("Create Character"));

    expect(onSubmit).toHaveBeenCalledWith("A cheerful robot chef.", "");
  });

  it("trims whitespace-only description as if empty", async () => {
    const onSubmit = jest.fn();
    const { findByText, findByPlaceholderText } = await renderModal({ onSubmit });

    fireEvent.changeText(await findByPlaceholderText(/A grumpy retired dragon-slayer/), "   ");
    fireEvent.press(await findByText("Create Character"));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("includes the trimmed appearance field when provided", async () => {
    const onSubmit = jest.fn();
    const { findByText, findByPlaceholderText } = await renderModal({ onSubmit });

    fireEvent.changeText(
      await findByPlaceholderText(/A grumpy retired dragon-slayer/),
      "A cheerful robot chef.",
    );
    fireEvent.changeText(
      await findByPlaceholderText(/Stocky, silver-bearded/),
      "  Shiny chrome plating.  ",
    );
    fireEvent.press(await findByText("Create Character"));

    expect(onSubmit).toHaveBeenCalledWith("A cheerful robot chef.", "Shiny chrome plating.");
  });

  it("clears both fields and calls onCancel when cancelled", async () => {
    const onCancel = jest.fn();
    const { findByText, findByPlaceholderText } = await renderModal({ onCancel });

    fireEvent.changeText(
      await findByPlaceholderText(/A grumpy retired dragon-slayer/),
      "Some text",
    );
    fireEvent.press(await findByText("Cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows a running character count for the description field", async () => {
    const { findByPlaceholderText, findByText } = await renderModal();
    fireEvent.changeText(await findByPlaceholderText(/A grumpy retired dragon-slayer/), "Hello");
    expect(await findByText("5/500")).toBeTruthy();
  });
});

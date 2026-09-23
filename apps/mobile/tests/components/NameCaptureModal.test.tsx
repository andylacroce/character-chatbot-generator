import { fireEvent, render } from "@testing-library/react-native";
import NameCaptureModal from "../../src/components/NameCaptureModal";
import { ThemeProvider } from "../../src/ThemeContext";

function renderModal(props: Partial<React.ComponentProps<typeof NameCaptureModal>> = {}) {
  return render(
    <ThemeProvider>
      <NameCaptureModal
        visible
        mode="gate"
        currentName=""
        onSave={jest.fn()}
        onClose={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe("NameCaptureModal", () => {
  it("shows gate-mode copy and a Skip button", async () => {
    const { findByText, queryByText } = await renderModal({ mode: "gate" });
    expect(await findByText("Before we begin")).toBeTruthy();
    expect(await findByText("Continue")).toBeTruthy();
    expect(queryByText("Skip for now")).toBeTruthy();
    expect(queryByText("Cancel")).toBeNull();
  });

  it("shows edit-mode copy and a Cancel button instead of Skip", async () => {
    const { findByText, queryByText } = await renderModal({ mode: "edit", currentName: "Andy" });
    expect(await findByText("Change your name")).toBeTruthy();
    expect(await findByText("Save")).toBeTruthy();
    expect(queryByText("Cancel")).toBeTruthy();
    expect(queryByText("Skip for now")).toBeNull();
  });

  it("pre-fills the input with the current name", async () => {
    const { findByDisplayValue } = await renderModal({ mode: "edit", currentName: "Andy" });
    expect(await findByDisplayValue("Andy")).toBeTruthy();
  });

  it("saves the trimmed typed value", async () => {
    const onSave = jest.fn();
    const { findByPlaceholderText, findByText } = await renderModal({ onSave });

    fireEvent.changeText(await findByPlaceholderText("e.g. Andy"), "  Jane  ");
    fireEvent.press(await findByText("Continue"));

    expect(onSave).toHaveBeenCalledWith("Jane");
  });

  it("calls onSkip (not onClose) when Skip is pressed in gate mode", async () => {
    const onSkip = jest.fn();
    const onClose = jest.fn();
    const { findByText } = await renderModal({ mode: "gate", onSkip, onClose });

    fireEvent.press(await findByText("Skip for now"));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to onClose when no onSkip is given", async () => {
    const onClose = jest.fn();
    const { findByText } = await renderModal({ mode: "gate", onSkip: undefined, onClose });

    fireEvent.press(await findByText("Skip for now"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel is pressed in edit mode", async () => {
    const onClose = jest.fn();
    const { findByText } = await renderModal({ mode: "edit", onClose });

    fireEvent.press(await findByText("Cancel"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets the typed value to currentName each time it reopens", async () => {
    const { rerender, findByDisplayValue, findByPlaceholderText } = await renderModal({
      visible: true,
      currentName: "Andy",
    });
    await findByDisplayValue("Andy");

    fireEvent.changeText(await findByPlaceholderText("e.g. Andy"), "Something else");

    await rerender(
      <ThemeProvider>
        <NameCaptureModal
          visible={false}
          mode="gate"
          currentName="Andy"
          onSave={jest.fn()}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    );
    await rerender(
      <ThemeProvider>
        <NameCaptureModal
          visible
          mode="gate"
          currentName="Andy"
          onSave={jest.fn()}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(await findByDisplayValue("Andy")).toBeTruthy();
  });
});

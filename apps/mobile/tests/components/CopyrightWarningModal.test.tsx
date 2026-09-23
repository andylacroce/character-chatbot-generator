import { fireEvent, render } from "@testing-library/react-native";
import type { CharacterValidationResult } from "character-chatbot-shared";
import CopyrightWarningModal from "../../src/components/CopyrightWarningModal";
import { ThemeProvider } from "../../src/ThemeContext";

const warningValidation: CharacterValidationResult = {
  characterName: "Mickey Mouse",
  isPublicDomain: false,
  isSafe: true,
  warningLevel: "warning",
  reason: "This character is a well-known corporate trademark.",
  suggestions: ["Felix the Cat", "Steamboat Bill"],
};

const cautionValidation: CharacterValidationResult = {
  characterName: "Superman",
  isPublicDomain: false,
  isSafe: true,
  warningLevel: "caution",
};

function renderModal(props: Partial<React.ComponentProps<typeof CopyrightWarningModal>> = {}) {
  return render(
    <ThemeProvider>
      <CopyrightWarningModal
        visible
        validation={warningValidation}
        onContinue={jest.fn()}
        onCancel={jest.fn()}
        onSelectSuggestion={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe("CopyrightWarningModal", () => {
  it("shows the warning title and character name for a hard warning", async () => {
    const { findByText } = await renderModal({ validation: warningValidation });
    expect(await findByText("Copyright/Trademark Warning")).toBeTruthy();
    expect(await findByText('"Mickey Mouse"')).toBeTruthy();
    expect(await findByText(warningValidation.reason!)).toBeTruthy();
  });

  it("shows a softer title for a caution-level validation", async () => {
    const { findByText, queryByText } = await renderModal({ validation: cautionValidation });
    expect(await findByText("Character Notice")).toBeTruthy();
    expect(queryByText("Copyright/Trademark Warning")).toBeNull();
  });

  it("omits the reason text when none is given", async () => {
    const { queryByText } = await renderModal({ validation: cautionValidation });
    expect(queryByText(/well-known corporate trademark/)).toBeNull();
  });

  it("renders each suggestion and selects one on tap", async () => {
    const onSelectSuggestion = jest.fn();
    const { findByText } = await renderModal({ onSelectSuggestion });

    expect(await findByText("Felix the Cat")).toBeTruthy();
    fireEvent.press(await findByText("Steamboat Bill"));

    expect(onSelectSuggestion).toHaveBeenCalledWith("Steamboat Bill");
  });

  it("omits the suggestions block when there are none", async () => {
    const { queryByText } = await renderModal({ validation: cautionValidation });
    expect(queryByText("Suggested alternatives (tap to use):")).toBeNull();
  });

  it("calls onCancel and onContinue from their respective buttons", async () => {
    const onCancel = jest.fn();
    const onContinue = jest.fn();
    const { findByText } = await renderModal({ onCancel, onContinue });

    fireEvent.press(await findByText("Cancel"));
    fireEvent.press(await findByText("Continue Anyway"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

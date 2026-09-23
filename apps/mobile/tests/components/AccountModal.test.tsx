import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import AccountModal from "../../src/components/AccountModal";
import { ThemeProvider } from "../../src/ThemeContext";
import type { UserNameContext } from "../../src/useUserName";

jest.mock("../../src/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from "../../src/AuthContext";

const mockedUseAuth = useAuth as jest.Mock;

function userNameCtx(overrides: Partial<UserNameContext> = {}): UserNameContext {
  return {
    name: "",
    setName: jest.fn(),
    isResolved: true,
    hasSkippedGate: false,
    markGateSkipped: jest.fn(),
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof AccountModal>> = {}) {
  return render(
    <ThemeProvider>
      <AccountModal
        visible
        onClose={jest.fn()}
        userNameCtx={userNameCtx()}
        onOpenHistory={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe("AccountModal", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      status: "signedOut",
      email: null,
      name: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
    });
  });

  it("shows a sign-in prompt when signed out", async () => {
    const { findAllByText } = await renderModal();
    // "Sign in" appears twice: the modal's title and the button label.
    expect(await findAllByText("Sign in")).toHaveLength(2);
  });

  it("hides Past chats when signed out", async () => {
    const { findAllByText, queryByText } = await renderModal();
    await findAllByText("Sign in");
    expect(queryByText("Past chats")).toBeNull();
  });

  it("offers Past chats when signed in", async () => {
    mockedUseAuth.mockReturnValue({
      status: "signedIn",
      email: "andy@example.com",
      name: "Andy",
      signIn: jest.fn(),
      signOut: jest.fn(),
    });
    const onOpenHistory = jest.fn();
    const { findByText } = await renderModal({ onOpenHistory });
    await fireEvent.press(await findByText("Past chats"));
    expect(onOpenHistory).toHaveBeenCalled();
  });

  it("shows the signed-in identity (name over email) and a sign-out button", async () => {
    mockedUseAuth.mockReturnValue({
      status: "signedIn",
      email: "andy@example.com",
      name: "Andy",
      signIn: jest.fn(),
      signOut: jest.fn(),
    });
    const { findByText } = await renderModal();
    expect(await findByText("Signed in")).toBeTruthy();
    expect(await findByText("Andy")).toBeTruthy();
    expect(await findByText("Sign out")).toBeTruthy();
  });

  it("falls back to email when no name is set while signed in", async () => {
    mockedUseAuth.mockReturnValue({
      status: "signedIn",
      email: "andy@example.com",
      name: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
    });
    const { findByText } = await renderModal();
    expect(await findByText("andy@example.com")).toBeTruthy();
  });

  it("calls signIn and shows an error message on failure", async () => {
    const signIn = jest.fn().mockResolvedValue({ ok: false, error: "failed" });
    mockedUseAuth.mockReturnValue({
      status: "signedOut",
      email: null,
      name: null,
      signIn,
      signOut: jest.fn(),
    });
    const { findAllByText, findByText } = await renderModal();

    await act(async () => {
      const matches = await findAllByText("Sign in");
      fireEvent.press(matches[matches.length - 1]);
    });

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(await findByText("Sign-in didn't go through. Please try again.")).toBeTruthy();
  });

  it("shows no error message for a cancelled sign-in", async () => {
    const signIn = jest.fn().mockResolvedValue({ ok: false, error: "cancelled" });
    mockedUseAuth.mockReturnValue({
      status: "signedOut",
      email: null,
      name: null,
      signIn,
      signOut: jest.fn(),
    });
    const { findAllByText, queryByText } = await renderModal();

    await act(async () => {
      const matches = await findAllByText("Sign in");
      fireEvent.press(matches[matches.length - 1]);
    });

    expect(queryByText("Sign-in didn't go through. Please try again.")).toBeNull();
  });

  it("calls signOut when Sign out is pressed", async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      status: "signedIn",
      email: "andy@example.com",
      name: "Andy",
      signIn: jest.fn(),
      signOut,
    });
    const { findByText } = await renderModal();

    await act(async () => {
      fireEvent.press(await findByText("Sign out"));
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("shows 'Add' as the name-row value when no name is set", async () => {
    const { findByText } = await renderModal({ userNameCtx: userNameCtx({ name: "" }) });
    expect(await findByText("Add")).toBeTruthy();
  });

  it("shows the current name in the name row when set", async () => {
    const { findByText } = await renderModal({ userNameCtx: userNameCtx({ name: "Andy" }) });
    expect(await findByText("Andy")).toBeTruthy();
  });

  it("opens the name-capture modal in edit mode from the name row", async () => {
    const { findByText, findAllByText } = await renderModal({
      userNameCtx: userNameCtx({ name: "Andy" }),
    });

    fireEvent.press(await findByText("Your name"));

    expect(await findByText("Change your name")).toBeTruthy();
    // "Andy" now appears both in the name row (behind the modal) and pre-filled in the
    // edit modal's input.
    expect((await findAllByText("Andy")).length).toBeGreaterThanOrEqual(1);
  });

  it("saving a new name from the edit modal updates userNameCtx and closes it", async () => {
    const setName = jest.fn();
    const { findByText, findByPlaceholderText, queryByText } = await renderModal({
      userNameCtx: userNameCtx({ name: "Andy", setName }),
    });

    fireEvent.press(await findByText("Your name"));
    fireEvent.changeText(await findByPlaceholderText("e.g. Andy"), "Jane");
    fireEvent.press(await findByText("Save"));

    expect(setName).toHaveBeenCalledWith("Jane");
    await waitFor(() => expect(queryByText("Change your name")).toBeNull());
  });

  it("calls onClose when Close is pressed", async () => {
    const onClose = jest.fn();
    const { findByText } = await renderModal({ onClose });

    fireEvent.press(await findByText("Close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

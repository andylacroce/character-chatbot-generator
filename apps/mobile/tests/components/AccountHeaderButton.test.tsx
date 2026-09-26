import { fireEvent, render } from "@testing-library/react-native";
import AccountHeaderButton from "../../src/components/AccountHeaderButton";
import { ThemeProvider } from "../../src/ThemeContext";

jest.mock("../../src/AuthContext", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../../src/useUserName", () => ({
  useUserName: jest.fn(() => ({
    name: "",
    setName: jest.fn(),
    isResolved: true,
    hasSkippedGate: false,
    markGateSkipped: jest.fn(),
  })),
}));

import { useAuth } from "../../src/AuthContext";

async function renderButton(navigate = jest.fn()) {
  const utils = await render(
    <ThemeProvider>
      <AccountHeaderButton navigation={{ navigate }} />
    </ThemeProvider>,
  );
  return { ...utils, navigate };
}

describe("AccountHeaderButton", () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ status: "signedOut" });
  });

  it("labels itself Sign in when signed out, and opens the account modal", async () => {
    const utils = await renderButton();
    await fireEvent.press(await utils.findByLabelText("Sign in"));
    expect(
      await utils.findByText(
        "Sign in with Google or email to save your characters and chat history to your account.",
      ),
    ).toBeTruthy();
  });

  it("labels itself Account when signed in", async () => {
    (useAuth as jest.Mock).mockReturnValue({
      status: "signedIn",
      name: "Andy",
      email: "andy@example.com",
    });
    const utils = await renderButton();
    expect(await utils.findByLabelText("Account")).toBeTruthy();
  });

  it("navigates to History and closes the modal when the modal requests it", async () => {
    (useAuth as jest.Mock).mockReturnValue({
      status: "signedIn",
      name: "Andy",
      email: "andy@example.com",
    });
    const utils = await renderButton();
    await fireEvent.press(await utils.findByLabelText("Account"));
    await fireEvent.press(await utils.findByText("Past chats"));

    expect(utils.navigate).toHaveBeenCalledWith("History");
    expect(utils.queryByText("Past chats")).toBeNull();
  });
});

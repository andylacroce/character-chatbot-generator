import { fireEvent, render } from "@testing-library/react-native";
import App from "../App";

// Without native inset measurements the real provider renders nothing.
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
// Each screen has its own suite; here we only check the app shell wires them up.
jest.mock("../src/screens/CreatorScreen", () => {
  const { Text } = require("react-native");
  return function MockCreator() {
    return <Text>creator-screen</Text>;
  };
});
jest.mock("../src/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("App", () => {
  it("opens on the Creator screen and toggles dark mode from the header", async () => {
    const utils = await render(<App />);

    expect(await utils.findByText("creator-screen")).toBeTruthy();

    const toggle = utils.getByLabelText(/Switch to (light|dark) mode/);
    const before = toggle.props.accessibilityLabel;
    await fireEvent.press(toggle);
    expect(utils.getByLabelText(/Switch to (light|dark) mode/).props.accessibilityLabel).not.toBe(
      before,
    );
  });
});

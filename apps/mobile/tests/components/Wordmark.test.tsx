import { render } from "@testing-library/react-native";
import Wordmark from "../../src/components/Wordmark";
import { ThemeProvider } from "../../src/ThemeContext";

describe("Wordmark", () => {
  it("renders every character of the given text", async () => {
    const { findAllByText } = await render(
      <ThemeProvider>
        <Wordmark text="Hi" />
      </ThemeProvider>,
    );
    expect(await findAllByText("H")).toHaveLength(1);
    expect(await findAllByText("i")).toHaveLength(1);
  });

  it("renders nothing for empty text without crashing", async () => {
    const { toJSON } = await render(
      <ThemeProvider>
        <Wordmark text="" />
      </ThemeProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders a repeated letter once per occurrence", async () => {
    const { findAllByText } = await render(
      <ThemeProvider>
        <Wordmark text="oo" />
      </ThemeProvider>,
    );
    expect(await findAllByText("o")).toHaveLength(2);
  });
});
